// Run linter readings on real repositories with vigiles' experimental_ruleProof: for each repository of
// inputs.json, clone it at its recorded commit, install its own pinned linter (lockfile, no install scripts),
// prove each reading on its planted pair, and list the repository files each proved reading flags.
//
//   node frame/rule-proof/run.mjs <inputs.json> <out-dir> [--only <index>]
//   node frame/rule-proof/run.mjs --matrix <inputs.json>     the plan job's matrix: [{ index, node }]
//
// inputs.json: [{ id, repo, sha, linter, rule, node?, node_why?, readings: [{ key, reading, pair }] }]
//   node: the Node major the item's job runs on (default 22), set when the repository's `engines` excludes 22.
//   reading: an EslintReading or RuffReading without the version-dependent parts, which are filled here:
//            ESLint `parser` (the repository's own TypeScript parser, when installed); Ruff plugin settings
//            under `lint` from Ruff 0.2 on, at the top level before.
// One JSON file per repository in <out-dir>; nothing from the repository is executed except its linter and the
// plugins its own lockfile installs (a .pnpmfile is ignored). Every outcome is written, including "not installed"
// and "not run". `install` has the shape install-schema.mjs declares: its outcome, the path that installed
// (as-designed, lockfile-pinned, date-matched), and every attempt in order with its failure (stage, cause from a
// closed list, the tool's exit and error code, free-text detail no code reads).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import toml from "@iarna/toml";
import yarnLockV1 from "@yarnpkg/lockfile";
import yaml from "js-yaml";
import semver from "semver";
import { z } from "zod";
import { findingsSchema, installSchema, pairCheckSchema } from "./install-schema.mjs";
import { experimental_ruleProof as rp } from "vigiles/rule-proof";

// The Ruff kit's own reading of a repository's pin files, and the helper every kit reads its linter's JSON report
// with (vigiles, the same version the runner installs). Their modules are not in vigiles' export map, so they are
// required by their path inside the installed package.
const ruleProofDir = path.join(path.dirname(fileURLToPath(import.meta.resolve("vigiles/rule-proof"))), "..", "core", "rule-proof");
const { ruffPin } = createRequire(import.meta.url)(path.join(ruleProofDir, "kits", "ruff.js"));
const { jsonArray, toRelative } = createRequire(import.meta.url)(path.join(ruleProofDir, "report.js"));

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

export function finish(reading, pinned, adjustments, pair = null) {
  if (reading.linter === "ruff") return { ...reading, settings: ruffSettings(reading.settings, pinned.version) };
  const plugin = pluginOf(reading.rule);
  if (plugin && expose(pinned.dir, plugin)) adjustments.add("pnpm-exposed");
  const ts = needsTsParser(pinned.dir, [{ reading, pair }]).length > 0;
  if (ts && expose(pinned.dir, "@typescript-eslint/parser")) adjustments.add("pnpm-exposed");
  return existsSync(path.join(pinned.dir, "node_modules", "@typescript-eslint/parser", "package.json"))
    ? { ...reading, parser: "@typescript-eslint/parser" } : reading;
}

// As-designed: a plugin is installed when the repository's own install put it in node_modules (after expose).
export function asDesignedPlugins(reading, dir) {
  const name = reading.linter === "eslint" ? pluginOf(reading.rule) : null;
  if (!name) return [];
  const pkg = readJson(path.join(dir, "node_modules", name, "package.json"));
  return [{ name, version: pkg?.version ?? null, error: pkg ? null : "not in the repository's own install" }];
}

// A release: a version semver reads as itself (MAJOR.MINOR.PATCH, nothing before or after) with no pre-release part.
const stable = (v) => typeof v === "string" && semver.valid(v) === v && semver.prerelease(v) === null;
const byVersion = (a, b) => semver.compare(a, b);

// The date-matched release of a commit (D10), by the package managers' own date flags: npm install --before <time>
// and uv pip compile --exclude-newer <time> (P3-S109 RUN-STATUS §8: npm matched the hand-built pick on 19 of 20
// (package, date) pairs, the 20th a peer resolution; uv on 6 of 6 Ruff dates). The time is the commit's committer date
// as a UTC instant.
export const utcInstant = (iso) => new Date(iso).toISOString();

// Ruff current at `at`: uv resolves the requirement «ruff» with --exclude-newer and answers a pylock.toml, read by a
// TOML parser. -> { version } or { failure }
export function uvRuffAt(deps, at) {
  const cmd = `uv pip compile - --exclude-newer ${at} --format pylock.toml --python-version 3.12 --no-header -q`;
  const r = deps.uvCompile(at);
  let version = null;
  if (r.code === 0) {
    try { version = (toml.parse(r.stdout).packages ?? []).find((p) => p.name === "ruff")?.version ?? null; } catch { version = null; }
  }
  if (r.code === 0 && stable(version)) return { version };
  return { failure: { stage: "resolve", cause: r.timedOut ? "timeout" : "unknown", tool: { cmd, exit: r.code ?? null, code: null }, detail: tailOf(r.stderr) } };
}

// ---- Install paths: what happens when the repository's own install leaves no linter ------------------------------
// 1. as-designed: vigiles installs the repository's own pinned linter from its root lockfile (the frozen rule; for
//    Ruff with no exact pin, or a pre-commit rev that is a commit sha and so no pin, the release current at the
//    commit's date).
// 2. lockfile-pinned (a runner gap, not a design change): the root install left no ESLint, or there is no root
//    lockfile, or it failed, but a package of the repository declares ESLint and a lockfile of the repository pins
//    it: those exact versions (ESLint, the TypeScript parser, each plugin a reading names that the same lockfile
//    pins) are installed at the root.
// 3. date-matched: ESLint, each plugin a reading names and, when asked (needsTsParser), the TypeScript parser, each
//    with the range "*", picked by npm --before <the commit's time>: every version, transitive packages included, is
//    the one npm resolves at that time, peers resolved by npm (a plugin whose ESLint peer excludes the newest ESLint
//    gets the newest ESLint it admits; no --legacy-peer-deps). TypeScript comes from the parser's own peer range.
// Paths 2 and 3 set the repository's root package.json, lockfiles, .npmrc and node_modules aside (outside the
// repository, so nothing set aside is linted) and install a manifest of their own with npm, scripts off.
const NODE_LOCKS = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];
const ASIDE = ["package.json", ...NODE_LOCKS, ".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmfile.cjs", ".pnpmfile.mjs",
  "pnpm-workspace.yaml", "bunfig.toml"];
const DEP_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const TS_PARSER = "@typescript-eslint/parser";

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const declares = (pkg, name) => DEP_KEYS.map((k) => pkg?.[k]?.[name]).find((v) => typeof v === "string") ?? null;

// Every package.json of the repository (node_modules aside) that declares ESLint, and how many files sit under it.
export function repoEslint(dir) {
  const pjs = globSync("**/package.json", { cwd: dir, ignore: ["**/node_modules/**", "**/.git/**"], posix: true }).sort();
  const declared = pjs.filter((p) => declares(readJson(path.join(dir, p)), "eslint") !== null);
  return { declared, package_jsons: pjs.length };
}

// The version a lockfile pins for `name` as the package at `pkgDir` (relative to the lockfile's folder) resolves it.
export function lockedVersion(lockPath, text, pkgDir, name) {
  const base = path.basename(lockPath);
  const clean = (v) => (typeof v === "string" ? v.replace(/\(.*$/, "").replace(/_.*$/, "") : null);
  if (base === "package-lock.json" || base === "npm-shrinkwrap.json") {
    const j = JSON.parse(text);
    const at = pkgDir === "." ? "" : `${pkgDir}/`;
    const v = j.packages?.[`${at}node_modules/${name}`]?.version ?? j.packages?.[`node_modules/${name}`]?.version ?? j.dependencies?.[name]?.version;
    return stable(v) ? v : null;
  }
  if (base === "pnpm-lock.yaml") {
    const j = yaml.load(text) ?? {};
    const imp = j.importers?.[pkgDir] ?? (pkgDir === "." ? j : null);
    const e = DEP_KEYS.map((k) => imp?.[k]?.[name]).find((x) => x !== undefined);
    const v = clean(typeof e === "object" && e !== null ? e.version : e);
    if (stable(v)) return v;
    const keys = Object.keys(j.packages ?? {}).map((k) => k.replace(/^\//, "")).filter((k) => k.startsWith(`${name}@`) || k.startsWith(`${name}/`));
    const vs = keys.map((k) => clean(k.slice(name.length + 1))).filter(stable);
    return vs.length ? vs.sort(byVersion).at(-1) : null;
  }
  if (base === "yarn.lock") {
    const vs = Object.entries(yarnEntries(text)).filter(([key]) => key.split(",").some((d) => descriptorName(d) === name))
      .map(([, e]) => e?.version).filter(stable);
    return vs.length ? vs.sort(byVersion).at(-1) : null;
  }
  return null;
}

// A yarn.lock's entries, each parsed by its format's own parser: Berry is YAML whose top level holds `__metadata`;
// v1 is yarn's own grammar (@yarnpkg/lockfile). Keys are descriptors, several joined by ", " in one key. Throws when
// neither reads it.
export function yarnEntries(text) {
  let doc = null;
  try { doc = yaml.load(text); } catch { doc = null; }
  if (doc && typeof doc === "object" && "__metadata" in doc) { const { __metadata: _m, ...entries } = doc; return entries; }
  const v1 = yarnLockV1.parse(text);
  if (v1.type !== "success") throw new Error(`yarn.lock v1: ${v1.type}`);
  return v1.object;
}

// A descriptor's package name: everything before the «@» that opens its range (a scoped name starts with «@»).
export function descriptorName(descriptor) {
  const d = descriptor.trim();
  const at = d.indexOf("@", d.startsWith("@") ? 1 : 0);
  return at < 0 ? d : d.slice(0, at);
}

// The package that declares ESLint with most files under it (ties: the shorter path, then by name), and the lockfile
// nearest above it that pins ESLint for it.
export function lockfilePin(dir, declared) {
  const files = globSync("**/*", { cwd: dir, ignore: ["**/node_modules/**", "**/.git/**"], nodir: true, posix: true, dot: true });
  const under = (d) => (d === "." ? files.length : files.filter((f) => f.startsWith(`${d}/`)).length);
  const cands = declared.map((p) => path.posix.dirname(p))
    .map((d) => ({ dir: d, files: under(d) }))
    .sort((a, b) => b.files - a.files || a.dir.split("/").length - b.dir.split("/").length || a.dir.localeCompare(b.dir));
  for (const c of cands) {
    const ups = c.dir === "." ? ["."] : c.dir.split("/").map((_, i, a) => a.slice(0, a.length - i).join("/")).concat(".");
    for (const up of ups) {
      for (const lock of NODE_LOCKS) {
        const lp = up === "." ? lock : `${up}/${lock}`;
        if (!existsSync(path.join(dir, lp)) || lock === "bun.lockb" || lock === "bun.lock") continue;
        const rel = up === "." ? c.dir : path.posix.relative(up, c.dir) || ".";
        const text = readFileSync(path.join(dir, lp), "utf8");
        let v = null;
        try { v = lockedVersion(lp, text, rel, "eslint"); } catch { v = null; }
        if (v) return { package: c.dir, files: c.files, lockfile: lp, importer: rel, eslint: v, text,
          candidates: cands.map((x) => `${x.dir} (${x.files} files)`) };
      }
    }
  }
  return { package: null, candidates: cands.map((x) => `${x.dir} (${x.files} files)`) };
}

const tailOf = (t) => (t ?? "").trim().split("\n").slice(-6).join("\n").slice(0, 600);

// Set the repository's root install files aside, outside the repository; remove its node_modules.
function setAside(dir, asideDir) {
  mkdirSync(asideDir, { recursive: true });
  const moved = ASIDE.filter((f) => existsSync(path.join(dir, f)));
  for (const f of moved) renameSync(path.join(dir, f), path.join(asideDir, f));
  rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
  return moved;
}

// npm runs with --json: its error code is read from {"error": {"code": …}} on stdout; stderr is only `detail`.
export function npmErrorCode(r) {
  try { return JSON.parse(r.stdout ?? "")?.error?.code ?? null; } catch { return null; }
}
const NETWORK = new Set(["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]);
// A failed npm call as a failure record: the cause from the exit and the parsed code alone.
export function npmFailureOf(cmd, r, { tsResolved = false } = {}) {
  const code = npmErrorCode(r);
  const cause = r.timedOut ? "timeout" : code === "ERESOLVE" ? (tsResolved ? "peer-conflict-typescript" : "peer-conflict-other")
    : code === "E404" || code === "ETARGET" ? "package-not-found" : NETWORK.has(code) ? "registry-or-network" : "unknown";
  return { stage: cause === "package-not-found" || cause === "registry-or-network" ? "fetch" : cause === "timeout" ? "fetch" : "resolve",
    cause, tool: { cmd, exit: r.code ?? null, code }, detail: tailOf(r.stderr) };
}

// A manifest of ESLint and its companions at fixed versions, then each plugin added on its own so one that cannot
// install (not on npm, no release by the date, a resolve error) costs only the readings that name it.
function npmManifest(dir, deps, base, plugins) {
  const write = (dev) => writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "rule-proof-install", private: true, devDependencies: dev }, null, 1) + "\n");
  const args = (legacy) => ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--json", ...(legacy ? ["--legacy-peer-deps"] : [])];
  const lock = (dev, legacy) => { write(dev); return deps.npm(args(legacy), dir); };
  const cmd = (legacy) => `npm ${args(legacy).join(" ")}`;
  const resolved = [];
  let r0 = lock(base, false);
  // TypeScript current at the date may be newer than the TypeScript parser's peer range (measured: typescript 7.0.2
  // against @typescript-eslint/parser 8.72.1, ERESOLVE). It is then left to npm, which installs the newest TypeScript
  // the parser's peer range admits; the version is read back from the lockfile and the record says so.
  if (r0.code !== 0 && npmErrorCode(r0) === "ERESOLVE" && base.typescript) {
    const { typescript: _drop, ...rest } = base;
    const r1 = lock(rest, false);
    if (r1.code === 0) {
      // the TypeScript npm chose is pinned from here on, so a later --legacy-peer-deps (which skips peers) keeps it
      const ts = readJson(path.join(dir, "package-lock.json"))?.packages?.["node_modules/typescript"]?.version;
      base = ts ? { ...rest, typescript: ts } : rest;
      r0 = ts ? lock(base, false) : r1;
      resolved.push({ cause: "peer-conflict-typescript", by: "typescript left to the parser's peer range" });
    }
  }
  if (r0.code !== 0) return { failure: npmFailureOf(cmd(false), r0) };
  let dev = { ...base }, legacy = false;
  const out = {};
  for (const [name, p] of Object.entries(plugins)) {
    if (p.version === null) { out[name] = p; continue; }
    const next = { ...dev, [name]: p.version };
    const r = lock(next, legacy);
    if (r.code === 0) { dev = next; out[name] = { ...p, error: null }; continue; }
    if (!legacy && npmErrorCode(r) === "ERESOLVE") {
      const r2 = lock(next, true);
      if (r2.code === 0) {
        dev = next; legacy = true; out[name] = { ...p, error: null, peer_conflict: true };
        resolved.push({ cause: "peer-conflict-other", by: `--legacy-peer-deps for ${name}` });
        continue;
      }
    }
    const f = npmFailureOf(cmd(legacy), r);
    out[name] = { version: null, error: `npm could not add ${name}@${p.version}`, cause: f.cause };
  }
  const rf = lock(dev, legacy);
  if (rf.code !== 0) return { failure: npmFailureOf(cmd(legacy), rf) };
  if (legacy) writeFileSync(path.join(dir, ".npmrc"), "legacy-peer-deps=true\n");
  return { plugins: out, legacy, versions: dev, resolved, tsResolved: resolved.some((x) => x.cause === "peer-conflict-typescript") };
}

// The date-matched manifest: the packages named with the range "*", npm --before <at> picking every version. Each plugin
// is added on its own, so one npm cannot resolve with ESLint at that time (not on npm, no release by then, a peer no
// ESLint release admits) costs only the readings that name it. The lockfile is removed before each resolution, so
// npm resolves the whole set afresh. -> { versions, plugins, typescriptFromPeerRange } or { failure }
function npmBeforeManifest(dir, deps, at, tsAsked, names) {
  const lockPath = path.join(dir, "package-lock.json");
  const args = ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--json", "--before", at];
  const cmd = `npm ${args.join(" ")}`;
  const lock = (dev) => {
    rmSync(lockPath, { force: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "rule-proof-install", private: true, devDependencies: dev }, null, 1) + "\n");
    return deps.npm(args, dir);
  };
  let dev = { eslint: "*", ...(tsAsked ? { [TS_PARSER]: "*" } : {}) };
  const r0 = lock(dev);
  if (r0.code !== 0) return { failure: npmFailureOf(cmd, r0) };
  const failed = {};
  for (const name of names) {
    const next = { ...dev, [name]: "*" };
    const r = lock(next);
    if (r.code === 0) { dev = next; continue; }
    const f = npmFailureOf(cmd, r);
    failed[name] = { version: null, error: `npm --before ${at} could not resolve ${name} with ESLint`, cause: f.cause };
  }
  let rf = lock(dev);
  if (rf.code !== 0) return { failure: npmFailureOf(cmd, rf) };
  const entry = (n) => readJson(lockPath)?.packages?.[`node_modules/${n}`] ?? null;
  // A parser that marks TypeScript an optional peer (5.x) gets none from npm: TypeScript is added with the range that
  // parser's lockfile entry declares, and npm picks it at the same time.
  let typescriptFromPeerRange = false;
  if (tsAsked && !entry("typescript")) {
    const range = entry(TS_PARSER)?.peerDependencies?.typescript;
    if (typeof range === "string") {
      dev = { ...dev, typescript: range };
      rf = lock(dev);
      if (rf.code !== 0) return { failure: npmFailureOf(cmd, rf) };
      typescriptFromPeerRange = true;
    }
  }
  const versions = Object.fromEntries(["eslint", TS_PARSER, "typescript"].map((n) => [n, entry(n)?.version]).filter(([, v]) => typeof v === "string"));
  const plugins = Object.fromEntries(names.map((n) => [n, failed[n] ?? { version: entry(n)?.version ?? null, error: entry(n) ? null : `${n} is not in npm's lockfile`, ...(entry(n) ? {} : { cause: "unknown" }) }]));
  return { versions, plugins, typescriptFromPeerRange };
}

const pluginNames = (readings) => [...new Set(readings.map((r) => pluginOf(r.reading.rule)).filter(Boolean))].sort();

// A file ESLint needs the TypeScript parser for, by its extension.
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
export const isTsFile = (p) => typeof p === "string" && TS_EXTENSIONS.has(path.extname(p));
const pairIsTs = (pair) => Boolean(pair) && [pair.bad?.path, pair.good?.path].some(isTsFile);
// What asks for the TypeScript parser, in order: a root tsconfig.json, a reading whose rule is typescript-eslint's, a
// planted pair that is a TypeScript file. Empty: no parser is installed. (D14: the planted pair was not asked, and 32
// sub-readings whose pair is .ts stopped at «Parsing error» in repositories with no root tsconfig.json.)
export function needsTsParser(dir, readings) {
  return [
    ...(existsSync(path.join(dir, "tsconfig.json")) ? ["root-tsconfig"] : []),
    ...(readings.some((r) => pluginOf(r.reading.rule) === "@typescript-eslint/eslint-plugin") ? ["typescript-eslint-rule"] : []),
    ...(readings.some((r) => pairIsTs(r.pair)) ? ["typescript-pair"] : []),
  ];
}

// Per reading: each plugin its rule names, the version installed, or why none was.
export function readingPlugins(reading, install) {
  const name = reading.linter === "eslint" ? pluginOf(reading.rule) : null;
  if (!name) return [];
  const p = install.plugins?.[name];
  if (p) return [{ name, version: p.version, error: p.error ?? null, ...(p.cause ? { cause: p.cause } : {}) }];
  return [{ name, version: null, error: install.path === "as-designed" ? "not in the repository's own install" : "not asked" }];
}

// Whether a root file other than .pre-commit-config.yaml pins Ruff, as the Ruff kit itself reads it: the kit's own
// ruffPin over the repository's root files (its lockfiles, requirements*.txt, pyproject.toml), the pre-commit file
// left out. The kit reads those before the pre-commit rev, so a pin there is what the install used.
export function otherRuffPin(dir) {
  const names = ["uv.lock", "poetry.lock", "pdm.lock", "pyproject.toml", ...globSync("requirements*.txt", { cwd: dir, posix: true })];
  const files = Object.fromEntries(names.filter((f) => existsSync(path.join(dir, f))).map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));
  return ruffPin(files) !== null;
}

const preCommitRuffRev = (dir) => {
  const pc = path.join(dir, ".pre-commit-config.yaml");
  try { return existsSync(pc) ? (yaml.load(readFileSync(pc, "utf8"))?.repos ?? []).find((r) => String(r.repo ?? "").endsWith("/ruff-pre-commit"))?.rev : undefined; } catch { return undefined; }
};

// Why vigiles' as-designed install did not install, from its stage and the repository's files — never its message.
export function asDesignedFailure(installed, dir, linter, nodeVersion = process.versions.node) {
  const detail = String(installed.reason ?? "").slice(0, 600);
  if (installed.stage === "timeout") return { stage: "fetch", cause: "timeout", detail };
  if (installed.stage === "no-lockfile") return { stage: "detect", cause: "no-lockfile", detail };
  if (installed.stage === "no-pin") return { stage: "detect", cause: "no-pin", detail };
  if (installed.stage === "no-linter") {
    const { declared } = repoEslint(dir);
    const cause = declared.length === 0 ? "no-linter-dependency" : declared.every((p) => p !== "package.json") ? "linter-in-subpackage" : "unknown";
    return { stage: "detect", cause, detail };
  }
  // stage "install": the install command did not exit 0
  if (linter === "ruff") {
    const rev = preCommitRuffRev(dir);
    const cause = typeof rev === "string" && !stable(semver.clean(rev) ?? "") && !otherRuffPin(dir) ? "tool-resolve" : "unknown";
    return { stage: "resolve", cause, detail };
  }
  const range = readJson(path.join(dir, "package.json"))?.engines?.node;
  if (typeof range === "string" && semver.validRange(range) && !semver.satisfies(nodeVersion, range)) return { stage: "resolve", cause: "node-engine", detail };
  if ([".pnpmfile.cjs", ".pnpmfile.mjs"].some((f) => existsSync(path.join(dir, f))) && existsSync(path.join(dir, ".gitmodules"))) return { stage: "fetch", cause: "submodule", detail };
  return { stage: "fetch", cause: "unknown", detail };
}

// ESLint on our own manifest (paths 2 and 3), then vigiles' own install of it. -> { installed, attempt, record }
async function ownManifest(dir, deps, pathName, versions, plugins) {
  const aside = setAside(dir, deps.asideDir);
  const m = npmManifest(dir, deps, versions, plugins);
  const record = { aside, versions: m.versions ?? versions, plugins: m.plugins ?? plugins, legacy_peer_deps: m.legacy ?? false,
    ...(m.tsResolved ? { typescript_peer_resolved: true } : {}) };
  const res = m.resolved?.length ? { resolved: m.resolved } : {};
  if (m.failure) return { installed: { kind: "not-installed" }, attempt: { path: pathName, outcome: "not-installed", failure: m.failure, ...res }, record };
  const installed = deps.install("eslint", dir);
  if (installed.kind === "installed") return { installed, attempt: { path: pathName, outcome: "installed", ...res }, record };
  const f = installed.stage === "timeout" ? { stage: "fetch", cause: "timeout" } : { stage: "fetch", cause: "unknown" };
  return { installed, attempt: { path: pathName, outcome: "not-installed", failure: { ...f, detail: String(installed.reason ?? "").slice(0, 600) }, ...res }, record };
}

// The install of one item: attempts in order (as-designed, then lockfile-pinned, then date-matched for ESLint),
// each with its outcome and, when it failed, a failure record. -> { installed, install } (install-schema.mjs)
export async function installFor(item, dir, deps) {
  const adjustments = new Set();
  const attempts = [];
  const shape = (installed, extra = {}) => ({
    installed,
    install: {
      outcome: installed.kind === "installed" ? "installed" : "not-installed",
      path: installed.kind === "installed" ? attempts.at(-1).path : null,
      version: installed.kind === "installed" ? installed.linter.version : null,
      versions: {}, plugins: {}, attempts, adjustments: [...adjustments], ...extra,
    },
  });
  let installed = deps.install(item.linter, dir);
  if (installed.kind === "installed") { attempts.push({ path: "as-designed", outcome: "installed" }); return shape(installed); }
  const first = asDesignedFailure(installed, dir, item.linter, deps.nodeVersion);
  attempts.push({ path: "as-designed", outcome: "not-installed", failure: first });
  if (item.linter === "ruff") {
    // The frozen rule: no exact pin (a pre-commit rev that is not a release is none) -> the release current at the date.
    if (first.cause === "no-pin" || first.cause === "tool-resolve") {
      if (first.cause === "tool-resolve") adjustments.add("pre-commit-rev-not-a-release");
      const commitIso = deps.commitIso(dir);
      const at = utcInstant(commitIso);
      const by = { date_matched_by: { tool: "uv", flag: "--exclude-newer", at } };
      const u = uvRuffAt(deps, at);
      if (u.version) {
        writeFileSync(path.join(dir, "requirements-date-matched-ruff.txt"), `ruff==${u.version}\n`);
        adjustments.add("date-matched-version");
        installed = deps.install(item.linter, dir);
        attempts.push(installed.kind === "installed" ? { path: "as-designed", outcome: "installed", rule: "ruff-date-matched" }
          : { path: "as-designed", outcome: "not-installed", rule: "ruff-date-matched", failure: { stage: "fetch", cause: installed.stage === "timeout" ? "timeout" : "unknown", detail: String(installed.reason ?? "").slice(0, 600) } });
        return shape(installed, { date_matched: { commit: commitIso, ruff: u.version }, ...by });
      }
      attempts.push({ path: "as-designed", outcome: "not-installed", rule: "ruff-date-matched", failure: u.failure });
      return shape(installed, by);
    }
    return shape(installed);
  }
  // ESLint: the as-designed install did not install.
  const repo = repoEslint(dir);
  const names = pluginNames(item.readings);
  const commitIso = deps.commitIso(dir);
  const pin = repo.declared.length ? lockfilePin(dir, repo.declared) : { package: null, candidates: [] };
  const tsAsked = needsTsParser(dir, item.readings);
  const common = { repo_eslint: repo, commit: commitIso, ...(tsAsked.length ? { ts_parser_asked: tsAsked } : {}) };
  if (pin.package !== null) {
    const versions = { eslint: pin.eslint };
    const v = (n) => { try { return lockedVersion(pin.lockfile, pin.text, pin.importer, n); } catch { return null; } };
    if (tsAsked.length && v(TS_PARSER)) { versions[TS_PARSER] = v(TS_PARSER); if (v("typescript")) versions.typescript = v("typescript"); }
    const plugins = Object.fromEntries(names.map((n) => [n, v(n) ? { version: v(n), error: null } : { version: null, error: `${n} is not pinned by ${pin.lockfile}`, cause: "package-not-found" }]));
    const r = await ownManifest(dir, deps, "lockfile-pinned", versions, plugins);
    attempts.push(r.attempt);
    const lp = { lockfile_pinned: { package: pin.package, lockfile: pin.lockfile, candidates: pin.candidates } };
    if (r.installed.kind === "installed") return shape(r.installed, { ...common, ...r.record, ...lp });
    adjustments.add("lockfile-pinned-failed");
    // the next path starts from the repository as it was: put the set-aside files back
    for (const f of ASIDE) rmSync(path.join(dir, f), { force: true });
    for (const f of r.record.aside) renameSync(path.join(deps.asideDir, f), path.join(dir, f));
    rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
  }
  const at = utcInstant(commitIso);
  const aside = setAside(dir, deps.asideDir);
  const m = npmBeforeManifest(dir, deps, at, tsAsked.length > 0, names);
  const record = { ...common, aside, date_matched_by: { tool: "npm", flag: "--before", at }, versions: m.versions ?? {}, plugins: m.plugins ?? {},
    ...(m.typescriptFromPeerRange ? { typescript_from_peer_range: true } : {}) };
  if (m.failure) { attempts.push({ path: "date-matched", outcome: "not-installed", failure: m.failure }); return shape({ kind: "not-installed" }, record); }
  const installed2 = deps.install("eslint", dir);
  if (installed2.kind === "installed") { attempts.push({ path: "date-matched", outcome: "installed" }); return shape(installed2, record); }
  attempts.push({ path: "date-matched", outcome: "not-installed", failure: { stage: "fetch", cause: installed2.stage === "timeout" ? "timeout" : "unknown", detail: String(installed2.reason ?? "").slice(0, 600) } });
  return shape(installed2, record);
}

// ---- Where each flagged file is flagged ------------------------------------------------------------------------------
// vigiles' `flagged` keeps a hit count per file. The places come from a second lint call on the flagged files alone,
// through the same kit and pinned linter (its invocation: the same config, `--format json` / `--output-format json`),
// read by a schema of the linter's own report. Never from text output.
// Nothing is thrown away: every finding is kept (`per_file` null = no limit). A line longer than `line_chars` keeps its
// first `line_chars` characters, its full length and the sha256 of the whole line.
export const FINDINGS_CAP = { per_file: null, context: 3, line_chars: 20_000 };
const eslintReport = z.array(z.object({ filePath: z.string(), messages: z.array(z.object({
  ruleId: z.string().nullable(), message: z.string(), line: z.number().int().optional(), column: z.number().int().optional() })) }));
const ruffReport = z.array(z.object({ filename: z.string(), code: z.string().nullable(), message: z.string(),
  location: z.object({ row: z.number().int(), column: z.number().int() }) }));

// A linter's JSON stdout -> { findings: [{ path, line, column, ruleId, message }] } for `rule` only, or { unreadable }.
export function parseFindings(linter, stdout, dir, rule) {
  const parsed = (linter === "ruff" ? ruffReport : eslintReport).safeParse(jsonArray(stdout));
  if (!parsed.success) return { unreadable: `no ${linter} JSON report in the output: ${stdout.slice(0, 200)}` };
  if (linter === "ruff") {
    return { findings: parsed.data.filter((d) => d.code === rule).map((d) => ({ path: toRelative(dir, d.filename),
      line: d.location.row, column: d.location.column, ruleId: d.code, message: d.message })) };
  }
  return { findings: parsed.data.flatMap((f) => f.messages.filter((m) => m.ruleId === rule && typeof m.line === "number")
    .map((m) => ({ path: toRelative(dir, f.filePath), line: m.line, column: m.column ?? 0, ruleId: m.ruleId, message: m.message }))) };
}

// A source line as stored: its text up to `max` characters; a longer line also holds `cut` (its full length) and `sha256`
// (the hash of the whole line), since a minified bundle is one line of megabytes.
const lineEntry = (t, max) => ({ text: t.length > max ? t.slice(0, max) : t, ...(t.length > max ? { cut: t.length, sha256: createHash("sha256").update(t).digest("hex") } : {}) });
const splitLines = (text) => {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  return { lines, last: lines.at(-1) === "" ? lines.length - 1 : lines.length };
};

// The source lines around `line` (1-based): line ± n, clipped at the file's edges, each as lineEntry stores it.
// (Format 2 copied this into every finding; format 3 keeps it as `context` over a per-file map, and linesOf gives it back.)
export function contextOf(text, line, n, max) {
  const { lines, last } = splitLines(text);
  const from = Math.max(1, line - n), to = Math.min(last, line + n);
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => {
    const k = from + i, { text: t, ...rest } = lineEntry(lines[k - 1], max);
    return { n: k, text: t, mark: k === line, ...rest };
  });
}

// A finding's source lines, back from the file's map: its `context` [from, to] resolved against `file.lines`, the
// finding's own line marked. Same shape contextOf gives (and format 1/2 stored in the finding: its `lines`).
export function linesOf(file, finding) {
  if (finding.lines) return finding.lines;
  if (!finding.context) return [];
  const [from, to] = finding.context;
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const { text, ...rest } = file.lines[String(from + i)];
    return { n: from + i, text, mark: from + i === finding.line, ...rest };
  });
}

// Findings grouped per file (format 3): all kept, sorted by line then column. The file's source lines that any finding's
// context touches are stored ONCE in `lines` ({"<n>": lineEntry}); a finding holds `context` [from, to] (line numbers).
// `capped` stays in the record for readers of older results and is always false.
// read(path) -> the file's text, or null when it cannot be read (then no lines and no context).
export function fileFindings(findings, read, cap) {
  // (no Object.groupBy: an item may run on Node 18 or 20)
  const byFile = {};
  for (const f of findings) (byFile[f.path] ??= []).push(f);
  return Object.fromEntries(Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)).map(([p, fs]) => {
    const text = read(p);
    const src = text === null ? null : splitLines(text);
    const needed = new Set();
    const items = [...fs].sort((a, b) => a.line - b.line || a.column - b.column).map(({ path: _p, ...f }) => {
      if (src === null) return f;
      const from = Math.max(1, f.line - cap.context), to = Math.min(src.last, f.line + cap.context);
      if (to < from) return f;
      for (let k = from; k <= to; k++) needed.add(k);
      return { ...f, context: [from, to] };
    });
    const lines = Object.fromEntries([...needed].sort((a, b) => a - b).map((k) => [String(k), lineEntry(src.lines[k - 1], cap.line_chars)]));
    return [p, { total: fs.length, capped: false, lines, items }];
  }));
}

// A result file: <id>.json.gz, the JSON gzipped; readers also take a plain .json (earlier runs).
export function writeResult(dir, id, result) {
  const file = path.join(dir, `${id}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify(result, null, 1) + "\n"));
  return file;
}
export function readResult(file) {
  const raw = readFileSync(file);
  return JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
}

// The arguments that make the linter print what it resolved for one file, with the kit's own config (`call` is the kit's
// invocation: its configPath). ESLint: --print-config (JSON). Ruff: --show-settings (Rust debug text, kept as printed).
export function configArgs(reading, call, file) {
  if (reading.linter === "ruff") {
    return ["check", "--no-cache", "--show-settings", "--exit-zero", "--no-force-exclude", "--no-fix", "--select", reading.rule, "--config", call.configPath, file];
  }
  return ["--config", call.configPath, "--print-config", file];
}

// One spawn of the pinned linter inside the repository, with the kit's config written for its duration.
function withKitConfig(pinned, reading, files, args, env) {
  const { kit, command, options } = pinned.run;
  const call = kit.invocation(reading, files, { dir: pinned.dir, cacheDir: options.cacheDir });
  if (existsSync(call.configPath)) return { unreadable: `${path.relative(pinned.dir, call.configPath)} already exists in the repository` };
  writeFileSync(call.configPath, call.configText);
  try {
    const [bin, ...prefix] = command;
    const r = spawnSync(bin, [...prefix, ...args(call)], { cwd: pinned.dir, env, encoding: "utf8", timeout: options.lintTimeoutMs ?? 150_000, maxBuffer: 256 * 1024 * 1024 });
    return { r, call };
  } finally { rmSync(call.configPath, { force: true }); }
}

// What the linter itself reports about the run: its own `--version` and the config it resolved for `file`, as printed
// (no parsing: the text is the record). A failure is kept in `error`; it never stops the findings.
function linterRecord(pinned, reading, file, version, env) {
  const [bin, ...prefix] = pinned.run.command;
  const v = spawnSync(bin, [...prefix, "--version"], { cwd: pinned.dir, env, encoding: "utf8", timeout: 60_000 });
  const reported = v.status === 0 ? (v.stdout ?? "").trim() : null;
  const linter = { name: reading.linter, version: typeof version === "string" ? version : null, reported };
  const got = withKitConfig(pinned, reading, [file], (call) => configArgs(reading, call, file), env);
  if ("unreadable" in got) return { linter, config: { file, exit: null, text: "", error: got.unreadable } };
  const { r } = got;
  return { linter, config: { file, exit: r.status, text: r.stdout ?? "", ...(r.status === 0 ? {} : { error: r.error ? String(r.error) : tailOf(r.stderr) }) } };
}

// The flagged files' findings for one proved reading, on its pinned linter. pinned: { dir, run: { kit, command, options } }
// (vigiles' PinnedLinter); version: the installed linter's version. -> the findingsSchema record.
export function findingsOf(pinned, reading, files, cap = FINDINGS_CAP, version = null) {
  const { kit, options } = pinned.run;
  const chunks = Array.from({ length: Math.ceil(files.length / 200) }, (_, i) => files.slice(i * 200, (i + 1) * 200));
  const env = { ...process.env, HOME: path.posix.join(options.cacheDir, "home"), XDG_CACHE_HOME: path.posix.join(options.cacheDir, "xdg"), CI: "1", ...kit.env(options.cacheDir) };
  const runs = chunks.map((chunk) => {
    const got = withKitConfig(pinned, reading, chunk, (call) => call.args, env);
    if ("unreadable" in got) return got;
    const { r } = got;
    if (r.error || !kit.reportCodes.includes(r.status)) return { unreadable: `the linter exited ${r.status ?? r.error?.code}: ${tailOf(`${r.stderr ?? ""}`)}` };
    return parseFindings(reading.linter, r.stdout, pinned.dir, reading.rule);
  });
  const error = runs.find((x) => "unreadable" in x)?.unreadable;
  const read = (p) => { try { return readFileSync(path.join(pinned.dir, p), "utf8"); } catch { return null; } };
  const files_ = fileFindings(runs.flatMap((x) => x.findings ?? []), read, cap);
  const record = files.length ? linterRecord(pinned, reading, files[0], version, env) : {};
  return findingsSchema.parse({ format: 3, cap, files: files_, ...record, ...(error ? { error } : {}) });
}

// The plan job's matrix: one entry per item; Node 22 unless the item names another (from the repository's engines).
export const matrixOf = (items) => items.map((it, index) => ({ index, node: String(it.node ?? "22") }));

// Why a config did not load, asked of the installed tools (diagnose.mjs; Ruff: `ruff rule <code>`'s exit status).
// Only for a reading whose proof stopped at config-load; its answer sits beside the linter's message.
const DIAGNOSE = path.join(path.dirname(new URL(import.meta.url).pathname), "diagnose.mjs");
export function diagnose(pinned, reading) {
  if (reading.linter === "ruff") {
    const r = spawnSync("uvx", [`ruff@${pinned.version}`, "rule", reading.rule], { cwd: pinned.dir, encoding: "utf8", timeout: 120_000,
      env: { ...process.env, UV_CACHE_DIR: path.join(cacheDir, "uv") } });
    return { rule_known: r.status === 0 ? true : r.status === 2 || r.status === 1 ? false : null, exit: r.status, plugin: null,
      plugin_loaded: null, options_valid: null, errors: r.status === 0 ? [] : [tailOf(r.stderr)] };
  }
  const at = path.join(pinned.dir, ".rule-proof-diagnose.mjs");
  writeFileSync(at, readFileSync(DIAGNOSE, "utf8"));
  try {
    const r = spawnSync(process.execPath, [at, JSON.stringify(reading)], { cwd: pinned.dir, encoding: "utf8", timeout: 120_000 });
    const line = (r.stdout ?? "").trim().split("\n").at(-1);
    try { return JSON.parse(line); } catch { return { errors: [`diagnose exited ${r.status}: ${tailOf(r.stderr)}`] }; }
  } finally { rmSync(at, { force: true }); }
}

// Why a planted pair did not run (proof stage «parse» or «pair-ignored»), from structure (install-schema.mjs
// PAIR_CAUSES): for «parse», the pair's file type and whether the reading has a parser; for «pair-ignored», ESLint's
// own config matching, asked of the installed ESLint for the setting's `files` alone and for `files` with `ignores`.
export function pairCauseOf(stage, { pair_ts: ts, parser, eslint }) {
  if (stage === "parse") return ts && !parser ? "no-ts-parser-in-install" : "parse-other";
  if (stage !== "pair-ignored" || !eslint) return "unknown";
  const off = [eslint.bad, eslint.good].find((f) => f && (f.files_only === false || f.full === false));
  if (!off) return "unknown";
  return off.files_only === false ? "pair-unconfigured" : "pair-in-ignores";
}

export function pairCheck(pinned, reading, pair, proof) {
  const base = { stage: proof.stage, pair_ts: pairIsTs(pair), parser: reading.parser ?? null };
  const eslint = proof.stage === "pair-ignored" && reading.linter !== "ruff" ? diagnosePair(pinned, reading, pair) : null;
  return pairCheckSchema.parse({ ...base, eslint, cause: pairCauseOf(proof.stage, { ...base, eslint }) });
}

// ESLint's own answer on the pair's two files: does the setting's `files` give it a config (files_only), and does
// the whole setting, its ignores in their global block as vigiles writes them (full)?
function diagnosePair(pinned, reading, pair) {
  const at = path.join(pinned.dir, ".rule-proof-diagnose.mjs");
  writeFileSync(at, readFileSync(DIAGNOSE, "utf8"));
  try {
    const r = spawnSync(process.execPath, [at, "--pair", JSON.stringify({ scope: reading.scope, bad: pair.bad.path, good: pair.good.path })],
      { cwd: pinned.dir, encoding: "utf8", timeout: 120_000 });
    const line = (r.stdout ?? "").trim().split("\n").at(-1);
    try { return JSON.parse(line); } catch { return { version: null, bad: null, good: null, errors: [`diagnose exited ${r.status}: ${tailOf(r.stderr)}`] }; }
  } finally { rmSync(at, { force: true }); }
}

// The machine's side of installFor: vigiles' install, the registries, npm, git.
function realDeps(dir) {
  const env = { npm_config_cache: path.join(cacheDir, "npm"), npm_config_update_notifier: "false", HOME: path.join(cacheDir, "home") };
  return {
    install: (linter, d) => rp.install(linter, d, { cacheDir }),
    uvCompile: (at) => {
      const r = spawnSync("uv", ["pip", "compile", "-", "--exclude-newer", at, "--format", "pylock.toml", "--python-version", "3.12", "--no-header", "-q"],
        { input: "ruff\n", encoding: "utf8", timeout: 300_000, env: { ...process.env, UV_CACHE_DIR: path.join(cacheDir, "uv") } });
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: `${r.stderr ?? ""}${r.error ? String(r.error) : ""}`, timedOut: r.error?.code === "ETIMEDOUT" };
    },
    npm: (args, cwd) => {
      const r = spawnSync("npm", args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 300_000 });
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: `${r.stderr ?? ""}${r.error ? String(r.error) : ""}` };
    },
    commitIso: (d) => git(d, "log", "-1", "--format=%cI").trim(),
    asideDir: path.join(work, "aside"),
  };
}

// A repository's .pnpmfile runs code at install even with scripts off (one measured repository cloned a submodule in its
// updateConfig hook and timed out). pnpm is told to ignore it; the adjustment is recorded.
function pnpmfileEnv(dir) {
  const has = [".pnpmfile.cjs", ".pnpmfile.mjs"].some((f) => existsSync(path.join(dir, f)));
  if (has) { process.env.npm_config_ignore_pnpmfile = "true"; process.env.pnpm_config_ignore_pnpmfile = "true"; }
  else { delete process.env.npm_config_ignore_pnpmfile; delete process.env.pnpm_config_ignore_pnpmfile; }
  return has;
}

async function runOne(item) {
  const dir = path.join(work, "repo");
  const t0 = Date.now();
  const adjustments = new Set();
  const result = { id: item.id, repo: item.repo, sha: item.sha, linter: item.linter, rule: item.rule };
  try {
    result.checked_out = clone(item.repo, item.sha, dir);
  } catch (e) {
    return { ...result, install: { outcome: "not-installed", path: null, version: null, versions: {}, plugins: {}, adjustments: [],
      attempts: [{ path: "as-designed", outcome: "not-installed", failure: { stage: "clone", cause: e.code === "ETIMEDOUT" ? "timeout" : "unknown",
        tool: { cmd: "git fetch", exit: typeof e.status === "number" ? e.status : null, code: e.code ?? null }, detail: String(e.stderr ?? e.message).slice(0, 500) } }] } };
  }
  if (pnpmfileEnv(dir)) adjustments.add("pnpmfile-ignored");
  if (item.node) result.node = { asked: String(item.node), ran: process.version, why: item.node_why ?? null };
  const deps = realDeps(dir);
  rmSync(deps.asideDir, { recursive: true, force: true });
  const { installed, install } = await installFor(item, dir, deps);
  for (const a of install.adjustments ?? []) adjustments.add(a);
  result.install = { ...install, adjustments: [...adjustments] };
  if (installed.kind !== "installed") return { ...result, adjustments: [...adjustments], seconds: (Date.now() - t0) / 1000 };
  const pinned = installed.linter;
  const fulls = [];
  result.readings = item.readings.map(({ key, reading, pair }) => {
    const full = finish(reading, pinned, adjustments, pair);
    fulls.push(full);
    const plugins = install.path === "as-designed" ? asDesignedPlugins(full, pinned.dir) : readingPlugins(full, install);
    const missing = plugins.find((p) => p.version === null);
    // On our own manifest a plugin that did not install is the reading's own failure kind, never a silent drop.
    if (missing && install.path !== "as-designed") return { key, reading: full, plugins, proof: { kind: "plugin-not-installed", plugin: missing.name, reason: missing.error } };
    const proof = rp.prove(pinned, full, pair);
    if (proof.kind === "not-run" && proof.stage === "config-load") return { key, reading: full, plugins, proof, diagnosis: diagnose(pinned, full) };
    if (proof.kind === "not-run" && (proof.stage === "parse" || proof.stage === "pair-ignored")) return { key, reading: full, plugins, proof, pair_check: pairCheck(pinned, full, pair, proof) };
    if (proof.kind !== "proved") return { key, reading: full, plugins, proof };
    const flagged = rp.flagged(proof.reading);
    const findings = flagged.kind === "ran" && flagged.flagged.length ? findingsOf(proof.reading.pinned, proof.reading.reading, flagged.flagged, FINDINGS_CAP, pinned.version) : undefined;
    return { key, reading: full, plugins, proof: { kind: "proved" }, flagged, ...(findings ? { findings } : {}) };
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

if (inputsPath === "--matrix") {
  console.log(JSON.stringify(matrixOf(JSON.parse(readFileSync(outDir, "utf8")))));
} else if (inputsPath) {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const items = JSON.parse(readFileSync(inputsPath, "utf8"));
  for (const [i, item] of items.entries()) {
    if (only !== null && i !== only) continue;
    if (existsSync(path.join(outDir, `${item.id}.json.gz`)) || existsSync(path.join(outDir, `${item.id}.json`))) { console.log(`skip ${item.id} (done)`); continue; }
    const r = await runOne(item);
    installSchema.parse(r.install); // a result whose install record is not the declared shape is not written
    writeResult(outDir, item.id, r);
    const proved = (r.readings ?? []).filter((x) => x.proof.kind === "proved").length;
    console.log(`${item.id} ${item.repo}: install ${r.install.outcome} ${r.install.path ?? r.install.attempts.at(-1).failure?.cause} ${r.install.version ?? ""}, ` +
      `proved ${proved}/${item.readings.length}, ${r.seconds ?? "-"} s`);
  }
}
