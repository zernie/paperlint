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
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import toml from "@iarna/toml";
import yaml from "js-yaml";
import semver from "semver";
import { installSchema } from "./install-schema.mjs";
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

// As-designed: a plugin is installed when the repository's own install put it in node_modules (after expose).
export function asDesignedPlugins(reading, dir) {
  const name = reading.linter === "eslint" ? pluginOf(reading.rule) : null;
  if (!name) return [];
  const pkg = readJson(path.join(dir, "node_modules", name, "package.json"));
  return [{ name, version: pkg?.version ?? null, error: pkg ? null : "not in the repository's own install" }];
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

// ---- Install paths: what happens when the repository's own install leaves no linter ------------------------------
// 1. as-designed: vigiles installs the repository's own pinned linter from its root lockfile (the frozen rule; for
//    Ruff with no exact pin, or a pre-commit rev that is a commit sha and so no pin, the release current at the
//    commit's date).
// 2. lockfile-pinned (a runner gap, not a design change): the root install left no ESLint, or there is no root
//    lockfile, or it failed, but a package of the repository declares ESLint and a lockfile of the repository pins
//    it: those exact versions (ESLint, the TypeScript parser, each plugin a reading names that the same lockfile
//    pins) are installed at the root.
// 3. date-matched (a declared deviation from the as-designed rule): ESLint, and each plugin a reading names, at the release
//    current at the commit's date; the TypeScript parser too when the repository has a tsconfig.json or a reading
//    names a typescript-eslint rule.
// Paths 2 and 3 set the repository's root package.json, lockfiles, .npmrc and node_modules aside (outside the
// repository, so nothing set aside is linted) and install a manifest of their own with npm, scripts off.
const NODE_LOCKS = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];
const ASIDE = ["package.json", ...NODE_LOCKS, ".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmfile.cjs", ".pnpmfile.mjs",
  "pnpm-workspace.yaml", "bunfig.toml"];
const STABLE = /^\d+\.\d+\.\d+$/;
const cmpV = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
const DEP_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const TS_PARSER = "@typescript-eslint/parser";

// npm: the highest release (no pre-release) published on or before the commit.
export function npmDateMatched(time, commitIso) {
  const at = Date.parse(commitIso);
  const ok = Object.entries(time ?? {}).filter(([v, t]) => STABLE.test(v) && Date.parse(t) <= at).map(([v]) => v);
  return ok.length ? ok.sort(cmpV).at(-1) : null;
}

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
    return STABLE.test(v ?? "") ? v : null;
  }
  if (base === "pnpm-lock.yaml") {
    const j = yaml.load(text) ?? {};
    const imp = j.importers?.[pkgDir] ?? (pkgDir === "." ? j : null);
    const e = DEP_KEYS.map((k) => imp?.[k]?.[name]).find((x) => x !== undefined);
    const v = clean(typeof e === "object" && e !== null ? e.version : e);
    if (STABLE.test(v ?? "")) return v;
    const keys = Object.keys(j.packages ?? {}).map((k) => k.replace(/^\//, "")).filter((k) => k.startsWith(`${name}@`) || k.startsWith(`${name}/`));
    const vs = keys.map((k) => clean(k.slice(name.length + 1))).filter((x) => STABLE.test(x ?? ""));
    return vs.length ? vs.sort(cmpV).at(-1) : null;
  }
  if (base === "yarn.lock") {
    const blocks = text.split(/\n\s*\n/);
    const vs = blocks.filter((b) => {
      const head = b.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
      return head.split(",").some((h) => h.trim().replace(/^"/, "").startsWith(`${name}@`));
    }).map((b) => /\n\s+version:?\s+"?([^"\s]+)"?/.exec(b)?.[1]).filter((x) => STABLE.test(x ?? ""));
    return vs.length ? vs.sort(cmpV).at(-1) : null;
  }
  return null;
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

const pluginNames = (readings) => [...new Set(readings.map((r) => pluginOf(r.reading.rule)).filter(Boolean))].sort();
const wantsTs = (dir, readings) => existsSync(path.join(dir, "tsconfig.json")) || readings.some((r) => r.reading.rule.startsWith("@typescript-eslint/"));

async function dateMatchedVersions(names, commitIso, deps) {
  const out = {};
  for (const name of names) {
    let doc;
    try { doc = await deps.registry(name); } catch { out[name] = { version: null, error: `the registry did not answer for ${name}`, cause: "registry-or-network" }; continue; }
    if (doc === null) { out[name] = { version: null, error: `${name} is not on the npm registry`, cause: "package-not-found" }; continue; }
    const v = npmDateMatched(doc.time, commitIso);
    out[name] = v ? { version: v, error: null } : { version: null, error: `${name} has no release on or before ${commitIso}`, cause: "package-not-found" };
  }
  return out;
}

// Per reading: each plugin its rule names, the version installed, or why none was.
export function readingPlugins(reading, install) {
  const name = reading.linter === "eslint" ? pluginOf(reading.rule) : null;
  if (!name) return [];
  const p = install.plugins?.[name];
  if (p) return [{ name, version: p.version, error: p.error ?? null, ...(p.cause ? { cause: p.cause } : {}) }];
  return [{ name, version: null, error: install.path === "as-designed" ? "not in the repository's own install" : "not asked" }];
}

// Whether a root file the Ruff kit reads before .pre-commit-config.yaml pins Ruff exactly: a lockfile naming ruff, a
// requirements file or pyproject.toml with a `ruff==` requirement (each parsed: TOML, requirement lines).
const exactRuff = (req) => /^ruff\s*===?\s*[\w.]+$/i.test(String(req).split(";")[0].trim());
export function otherRuffPin(dir) {
  const has = (f) => existsSync(path.join(dir, f));
  const read = (f) => readFileSync(path.join(dir, f), "utf8");
  for (const lock of ["uv.lock", "poetry.lock", "pdm.lock"]) {
    if (!has(lock)) continue;
    try { if ((toml.parse(read(lock)).package ?? []).some((p) => p.name === "ruff")) return true; } catch { /* unreadable: no pin from it */ }
  }
  const reqs = globSync("requirements*.txt", { cwd: dir, posix: true });
  if (reqs.some((f) => read(f).split("\n").map((l) => l.split("#")[0].trim()).some(exactRuff))) return true;
  if (has("pyproject.toml")) {
    const strings = (v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    try { if (strings(toml.parse(read("pyproject.toml"))).some(exactRuff)) return true; } catch { /* unreadable: no pin */ }
  }
  return false;
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
    const cause = typeof rev === "string" && !STABLE.test(rev.replace(/^v/, "")) && !otherRuffPin(dir) ? "tool-resolve" : "unknown";
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
      let releases = null;
      try { releases = await deps.ruffReleases(); } catch { releases = null; }
      const version = releases ? dateMatched(releases, commitIso) : null;
      if (version) {
        writeFileSync(path.join(dir, "requirements-date-matched-ruff.txt"), `ruff==${version}\n`);
        adjustments.add("date-matched-version");
        installed = deps.install(item.linter, dir);
        attempts.push(installed.kind === "installed" ? { path: "as-designed", outcome: "installed", rule: "ruff-date-matched" }
          : { path: "as-designed", outcome: "not-installed", rule: "ruff-date-matched", failure: { stage: "fetch", cause: installed.stage === "timeout" ? "timeout" : "unknown", detail: String(installed.reason ?? "").slice(0, 600) } });
        return shape(installed, { date_matched: { commit: commitIso, ruff: version } });
      }
      attempts.push({ path: "as-designed", outcome: "not-installed", rule: "ruff-date-matched",
        failure: { stage: "fetch", cause: releases ? "package-not-found" : "registry-or-network", detail: "no Ruff release on or before the commit's date" } });
    }
    return shape(installed);
  }
  // ESLint: the as-designed install did not install.
  const repo = repoEslint(dir);
  const names = pluginNames(item.readings);
  const commitIso = deps.commitIso(dir);
  const pin = repo.declared.length ? lockfilePin(dir, repo.declared) : { package: null, candidates: [] };
  const common = { repo_eslint: repo, commit: commitIso };
  if (pin.package !== null) {
    const versions = { eslint: pin.eslint };
    const v = (n) => { try { return lockedVersion(pin.lockfile, pin.text, pin.importer, n); } catch { return null; } };
    if (wantsTs(dir, item.readings) && v(TS_PARSER)) { versions[TS_PARSER] = v(TS_PARSER); if (v("typescript")) versions.typescript = v("typescript"); }
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
  const want = ["eslint", ...(wantsTs(dir, item.readings) ? [TS_PARSER, "typescript"] : [])];
  const base = await dateMatchedVersions(want, commitIso, deps);
  if (base.eslint.version === null) {
    attempts.push({ path: "date-matched", outcome: "not-installed", failure: { stage: "fetch", cause: base.eslint.cause, detail: base.eslint.error } });
    return shape({ kind: "not-installed" }, common);
  }
  const versions = Object.fromEntries(Object.entries(base).filter(([, x]) => x.version).map(([n, x]) => [n, x.version]));
  const plugins = await dateMatchedVersions(names, commitIso, deps);
  const r = await ownManifest(dir, deps, "date-matched", versions, plugins);
  attempts.push(r.attempt);
  return shape(r.installed, { ...common, ...r.record });
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

// The machine's side of installFor: vigiles' install, the registries, npm, git.
function realDeps(dir) {
  const env = { npm_config_cache: path.join(cacheDir, "npm"), npm_config_update_notifier: "false", HOME: path.join(cacheDir, "home") };
  return {
    install: (linter, d) => rp.install(linter, d, { cacheDir }),
    registry: async (name) => {
      const r = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`registry ${name}: HTTP ${r.status}`);
      return r.json();
    },
    ruffReleases,
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
    const full = finish(reading, pinned, adjustments);
    fulls.push(full);
    const plugins = install.path === "as-designed" ? asDesignedPlugins(full, pinned.dir) : readingPlugins(full, install);
    const missing = plugins.find((p) => p.version === null);
    // On our own manifest a plugin that did not install is the reading's own failure kind, never a silent drop.
    if (missing && install.path !== "as-designed") return { key, reading: full, plugins, proof: { kind: "plugin-not-installed", plugin: missing.name, reason: missing.error } };
    const proof = rp.prove(pinned, full, pair);
    if (proof.kind === "not-run" && proof.stage === "config-load") return { key, reading: full, plugins, proof, diagnosis: diagnose(pinned, full) };
    if (proof.kind !== "proved") return { key, reading: full, plugins, proof };
    const flagged = rp.flagged(proof.reading);
    return { key, reading: full, plugins, proof: { kind: "proved" }, flagged };
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
    const out = path.join(outDir, `${item.id}.json`);
    if (existsSync(out)) { console.log(`skip ${item.id} (done)`); continue; }
    const r = await runOne(item);
    installSchema.parse(r.install); // a result whose install record is not the declared shape is not written
    writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
    const proved = (r.readings ?? []).filter((x) => x.proof.kind === "proved").length;
    console.log(`${item.id} ${item.repo}: install ${r.install.outcome} ${r.install.path ?? r.install.attempts.at(-1).failure?.cause} ${r.install.version ?? ""}, ` +
      `proved ${proved}/${item.readings.length}, ${r.seconds ?? "-"} s`);
  }
}
