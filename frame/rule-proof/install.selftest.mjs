// Selftest of run.mjs's install paths on planted repository fixtures, offline: the registry, npm and the linter
// install are fakes, so nothing is fetched and nothing from a fixture runs.
//   node frame/rule-proof/install.selftest.mjs   (exit 1 on a defect)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { optionsSchema, pluginPart } from "./diagnose.mjs";
import { installSchema, jsonSchema, pairCheckSchema } from "./install-schema.mjs";
import semver from "semver";
import * as runner from "./run.mjs";

const { installFor: installForReal, lockedVersion, needsTsParser, otherRuffPin, pairCauseOf, pairCheck, readingPlugins, repoEslint } = runner;

const fail = [];
const seenInstalls = [];
const installFor = async (...a) => { const r = await installForReal(...a); seenInstalls.push(r.install); return r; };
const check = (ok, what) => { if (!ok) fail.push(what); };
const T = (d) => `${d}T00:00:00.000Z`;

const time = { created: T("2013-06-01"), modified: T("2026-10-01"), "8.57.0": T("2024-02-23"), "9.0.0": T("2024-04-05"),
  "9.1.0-rc.0": T("2024-04-10"), "9.1.0": T("2024-04-19"), "8.57.1": T("2024-09-16") };

function repo(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-fixture-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    writeFileSync(path.join(dir, p), text);
  }
  return dir;
}

// Fakes. The install stands in for vigiles' rp.install: it installs only from a lockfile, and finds ESLint only when
// the lockfile's package.json depends on it, as the real kit does. npm with --before stands in for npm's resolver on a
// registry of `docs` ({name: {time: {version: iso}, peers: {version: {eslint, typescript, typescript_optional}}}}): each
// package the newest stable release on or before the date that its range admits, ESLint the newest that every chosen
// package's ESLint peer admits (ERESOLVE when none), TypeScript from the parser's peer range when the parser requires
// it; a name it does not know is E404, no release by the date ETARGET. uv pip compile --exclude-newer stands in for
// uv on the Ruff releases `ruff` ({version: [{upload_time_iso_8601}]}), answering a pylock.toml.
export function npmResolve(dev, docs, before) {
  const at = Date.parse(before);
  const at_ = (name, spec) => {
    const d = docs[name];
    if (!d) return { code: "E404" };
    const vs = Object.entries(d.time ?? {}).filter(([v, t]) => semver.valid(v) === v && !semver.prerelease(v) && Date.parse(t) <= at && semver.satisfies(v, spec)).map(([v]) => v);
    return vs.length ? { list: vs.sort(semver.rcompare) } : { code: "ETARGET" };
  };
  const pick = {};
  for (const [n, spec] of Object.entries(dev)) {
    if (n === "eslint" || n === "typescript") continue;
    const r = at_(n, spec);
    if (r.code) return { error: r.code };
    pick[n] = r.list[0];
  }
  const peers = (n) => docs[n]?.peers?.[pick[n]] ?? {};
  const e = at_("eslint", dev.eslint ?? "*");
  if (e.code) return { error: e.code };
  const eslint = e.list.find((v) => Object.keys(pick).every((n) => !peers(n).eslint || semver.satisfies(v, peers(n).eslint)));
  if (!eslint) return { error: "ERESOLVE" };
  pick.eslint = eslint;
  const tp = pick["@typescript-eslint/parser"] ? peers("@typescript-eslint/parser") : {};
  if (dev.typescript) {
    const t = at_("typescript", dev.typescript);
    if (t.code) return { error: t.code };
    const v = t.list.find((x) => !tp.typescript || semver.satisfies(x, tp.typescript));
    if (!v) return { error: "ERESOLVE" };
    pick.typescript = v;
  } else if (tp.typescript && !tp.typescript_optional) {
    const t = at_("typescript", tp.typescript);
    if (t.code) return { error: "ERESOLVE" };
    pick.typescript = t.list[0];
  }
  const entry = (n) => {
    const p = peers(n);
    const pd = Object.fromEntries(["eslint", "typescript"].filter((k) => p[k]).map((k) => [k, p[k]]));
    return { version: pick[n], ...(Object.keys(pd).length ? { peerDependencies: pd } : {}),
      ...(p.typescript_optional ? { peerDependenciesMeta: { typescript: { optional: true } } } : {}) };
  };
  return { packages: { "": { devDependencies: dev }, ...Object.fromEntries(Object.keys(pick).map((n) => [`node_modules/${n}`, entry(n)])) } };
}

const pylock = (version) => `lock-version = "1.0"\ncreated-by = "uv"\n\n[[packages]]\nname = "ruff"\nversion = "${version}"\n`;

function fakes({ registryDocs = {}, ruff = {} } = {}) {
  const calls = { registry: [], npm: [], install: [], uv: [] };
  return {
    calls,
    deps: {
      install: (linter, dir) => {
        calls.install.push(linter);
        if (linter === "ruff") {
          const req = existsSync(path.join(dir, "requirements-date-matched-ruff.txt"));
          return req ? { kind: "installed", linter: { version: readFileSync(path.join(dir, "requirements-date-matched-ruff.txt"), "utf8").trim().split("==")[1], dir } }
            : { kind: "not-installed", stage: "install", reason: `uvx exited 1: Distribution not found at: file://${dir}/f12be1ebaa5351c1fc76472de98db2c3446c8253` };
        }
        if (!existsSync(path.join(dir, "package-lock.json"))) return { kind: "not-installed", stage: "no-lockfile", reason: "no lockfile" };
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
        const lock = JSON.parse(readFileSync(path.join(dir, "package-lock.json"), "utf8") || "{}");
        const v = lock.packages?.["node_modules/eslint"]?.version ?? (pkg.devDependencies ?? {}).eslint ?? (pkg.dependencies ?? {}).eslint;
        return v ? { kind: "installed", linter: { version: v, dir } } : { kind: "not-installed", stage: "no-linter", reason: "no eslint" };
      },
      registry: async (name) => { calls.registry.push(name); return registryDocs[name] ?? null; },
      ruffReleases: async () => ruff,
      uvCompile: (iso) => {
        calls.uv.push(iso);
        const at = Date.parse(iso);
        const ok = Object.entries(ruff).filter(([v, f]) => semver.valid(v) === v && f.length && Math.min(...f.map((x) => Date.parse(x.upload_time_iso_8601))) <= at).map(([v]) => v);
        return ok.length ? { code: 0, stdout: pylock(ok.sort(semver.rcompare)[0]), stderr: "" } : { code: 1, stdout: "", stderr: "No solution found when resolving dependencies" };
      },
      npm: (args, cwd) => {
        calls.npm.push(args.join(" "));
        const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
        const bi = args.indexOf("--before");
        if (bi >= 0) {
          const r = npmResolve(pkg.devDependencies, registryDocs, args[bi + 1]);
          if (r.error) return { code: 1, stdout: JSON.stringify({ error: { code: r.error } }), stderr: "npm error see the log" };
          writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: r.packages }));
          return { code: 0, stdout: "{}", stderr: "" };
        }
        const bad = Object.keys(pkg.devDependencies).find((n) => n === "eslint-plugin-conflicts");
        if (bad && !args.includes("--legacy-peer-deps")) return { code: 1, stdout: JSON.stringify({ error: { code: "ERESOLVE", summary: "unable to resolve dependency tree" } }), stderr: "npm error see the log" };
        writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": pkg } }));
        return { code: 0, stderr: "" };
      },
      commitIso: () => "2024-04-12T05:00:00+05:00",
      asideDir: mkdtempSync(path.join(tmpdir(), "rp-aside-")),
    },
  };
}

const reading = (key, rule) => ({ key, reading: { linter: "eslint", rule, options: [], scope: { files: [], ignores: [] } } });
const item = { id: "DX01", linter: "eslint", rule: "no-tabs", readings: [reading("anthropic-s1", "no-tabs"),
  reading("google-s1", "check-file/folder-naming-convention"), reading("deepseek-s1", "nonexistent/x"),
  reading("deepseek-s2", "conflicts/y")] };
const docs = { eslint: { time }, "eslint-plugin-check-file": { time: { "2.6.0": T("2023-08-01"), "2.8.0": T("2024-04-20") } },
  "eslint-plugin-conflicts": { time: { "1.0.0": T("2022-01-01") }, peers: { "1.0.0": { eslint: "^6" } } } };

// 1. A planted repository with no lockfile takes the date-matched path.
{
  const dir = repo({ "package.json": JSON.stringify({ name: "fixture", devDependencies: { eslint: "^9" } }), "src/a.js": "x\n", ".npmrc": "registry=https://example.invalid/\n" });
  const { deps, calls } = fakes({ registryDocs: docs });
  const r = await installFor(item, dir, deps);
  check(r.installed.kind === "installed", `no-lockfile fixture: installed ${JSON.stringify(r.installed)}`);
  check(r.install.path === "date-matched", `no-lockfile fixture: path ${r.install.path}, want date-matched`);
  check(r.install.attempts[0].failure?.cause === "no-lockfile" && r.install.attempts[0].failure?.stage === "detect", "the as-designed failure is attempt 0, with its stage and cause");
  check(r.install.versions?.eslint === "9.0.0", `ESLint current at the commit's date: ${JSON.stringify(r.install.versions)}`);
  check(r.install.repo_eslint?.declared?.[0] === "package.json", "the repository's own ESLint declarations are recorded");
  const p = r.install.plugins ?? {};
  check(p["eslint-plugin-check-file"]?.version === "2.6.0" && p["eslint-plugin-check-file"]?.error === null, `plugin at its release current at that date: ${JSON.stringify(p)}`);
  check(p["eslint-plugin-nonexistent"]?.version === null && p["eslint-plugin-nonexistent"]?.cause === "package-not-found", `a plugin npm does not have is an error with npm's code as its cause, not a drop: ${JSON.stringify(p["eslint-plugin-nonexistent"])}`);
  check(p["eslint-plugin-conflicts"]?.version === null && p["eslint-plugin-conflicts"]?.cause === "peer-conflict-other" && !r.install.legacy_peer_deps,
    `a plugin whose ESLint peer no release at the date admits does not install (no --legacy-peer-deps): ${JSON.stringify(p["eslint-plugin-conflicts"])} legacy ${r.install.legacy_peer_deps}`);
  check(existsSync(path.join(deps.asideDir, ".npmrc")) && existsSync(path.join(deps.asideDir, "package.json")), "the repository's package.json and .npmrc are set aside, outside the repository");
  check(!existsSync(path.join(dir, ".npmrc")), "no .npmrc sits in the repository (the repository's is set aside, none of ours is written)");
  const rp = Object.fromEntries(item.readings.map((x) => [x.key, readingPlugins(x.reading, r.install)]));
  check(JSON.stringify(rp["anthropic-s1"]) === "[]", "a core rule names no plugin");
  check(rp["google-s1"][0]?.name === "eslint-plugin-check-file" && rp["google-s1"][0]?.version === "2.6.0", `reading plugins ${JSON.stringify(rp["google-s1"])}`);
  check(rp["deepseek-s1"][0]?.version === null && rp["deepseek-s1"][0]?.error, "a reading whose plugin did not install carries the error");
  check(calls.npm.length > 0 && calls.npm.every((a) => a.includes("--before 2024-04-12T00:00:00.000Z")) && calls.registry.length === 0,
    `npm picks the versions itself, --before the commit's time in UTC; the registry is not read by the runner: ${JSON.stringify(calls)}`);
}

// 2. A repository with a lockfile and ESLint stays on the as-designed path; nothing is fetched.
{
  const dir = repo({ "package.json": JSON.stringify({ devDependencies: { eslint: "9.4.0" } }), "package-lock.json": "{}", "src/a.js": "x\n" });
  const { deps, calls } = fakes({ registryDocs: docs });
  const r = await installFor(item, dir, deps);
  check(r.install.path === "as-designed" && r.installed.kind === "installed" && r.install.version === "9.4.0", `lockfile fixture: ${JSON.stringify(r.install)}`);
  check(calls.registry.length === 0 && calls.npm.length === 0, "the as-designed path asks no registry and runs no npm");
}

// 3. A repository with no ESLint of its own still takes the date-matched path, marked so («repository has no ESLint»).
{
  const dir = repo({ "package.json": JSON.stringify({ name: "x" }), "package-lock.json": "{}", "web/package.json": "{}" });
  const { deps } = fakes({ registryDocs: docs });
  const r = await installFor({ ...item, readings: [reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(r.install.attempts[0].failure?.cause === "no-linter-dependency" && r.install.path === "date-matched", `no-linter fixture: ${JSON.stringify(r.install)}`);
  check(r.install.repo_eslint?.declared?.length === 0, "the repository declares no ESLint anywhere");
}

// 4. Ruff: a pre-commit rev that is a commit sha is no exact pin; the frozen no-pin rule (date-matched) applies.
{
  const dir = repo({ ".pre-commit-config.yaml": "repos:\n  - repo: https://github.com/astral-sh/ruff-pre-commit\n    rev: f12be1ebaa5351c1fc76472de98db2c3446c8253\n" });
  const { deps } = fakes({ ruff: { "0.4.1": [{ upload_time_iso_8601: T("2024-04-01") }], "0.5.0": [{ upload_time_iso_8601: T("2024-06-01") }] } });
  const r = await installFor({ id: "DR", linter: "ruff", readings: [] }, dir, deps);
  check(r.installed.kind === "installed" && r.install.path === "as-designed" && r.install.date_matched?.ruff === "0.4.1", `ruff sha rev: ${JSON.stringify(r.install)}`);
  check((r.install.adjustments ?? []).includes("pre-commit-rev-not-a-release"), "the reason is recorded as an adjustment");
}

// 6. ESLint declared in a sub-package with its own lockfile, none at the root: those exact versions (lockfile-pinned).
{
  const lock = { lockfileVersion: 3, packages: { "": {}, "node_modules/eslint": { version: "9.2.0" },
    "node_modules/eslint-plugin-react": { version: "7.34.1" } } };
  const dir = repo({ "README.md": "x\n", "frontend/package.json": JSON.stringify({ devDependencies: { eslint: "^9.1.0", "eslint-plugin-react": "^7" } }),
    "frontend/package-lock.json": JSON.stringify(lock), "frontend/src/a.jsx": "x\n", "docs/package.json": "{}" });
  const { deps, calls } = fakes({ registryDocs: docs });
  const it = { id: "DX02", linter: "eslint", readings: [reading("anthropic-s1", "react/no-danger"), reading("google-s1", "import/no-cycle")] };
  const r = await installFor(it, dir, deps);
  check(r.install.path === "lockfile-pinned" && r.installed.kind === "installed", `sub-package fixture: ${JSON.stringify(r.install)}`);
  check(r.install.versions?.eslint === "9.2.0" && r.install.lockfile_pinned?.package === "frontend" && r.install.lockfile_pinned?.lockfile === "frontend/package-lock.json", `the sub-package's own pin: ${JSON.stringify(r.install.versions)} ${JSON.stringify(r.install.lockfile_pinned)}`);
  check(r.install.plugins?.["eslint-plugin-react"]?.version === "7.34.1", "a plugin the same lockfile pins, at that version");
  check(r.install.plugins?.["eslint-plugin-import"]?.version === null && /not pinned/.test(r.install.plugins?.["eslint-plugin-import"]?.error ?? ""), "a plugin the lockfile does not pin is an error on that path, not a date-matched install");
  check(r.install.attempts[0].failure?.cause === "no-lockfile" && calls.registry.length === 0, "nothing asked of the registry on the lockfile-pinned path");
}

// 7. Lockfile formats: pnpm importers (v9, with a peer suffix), yarn v1 and Berry blocks.
{
  const pnpm = "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  packages/ui:\n    devDependencies:\n      eslint:\n        specifier: 'catalog:'\n        version: 9.39.2(jiti@2.4.2)\n";
  check(lockedVersion("pnpm-lock.yaml", pnpm, "packages/ui", "eslint") === "9.39.2", "pnpm importer version, peer suffix dropped");
  const y1 = '# yarn lockfile v1\n\n\n"@babel/core@^7.0.0":\n  version "7.1.0"\n\neslint@^8.0.0, eslint@^8.57.0:\n  version "8.57.0"\n  resolved "x"\n';
  check(lockedVersion("yarn.lock", y1, ".", "eslint") === "8.57.0", "yarn v1 block");
  const berry = '__metadata:\n  version: 8\n\n"eslint@npm:^9.0.0":\n  version: 9.1.1\n  resolution: "eslint@npm:9.1.1"\n';
  check(lockedVersion("yarn.lock", berry, ".", "eslint") === "9.1.1", "yarn Berry block");
  check(lockedVersion("yarn.lock", y1, ".", "eslint-plugin-x") === null, "a package the lockfile does not pin: null");
}

// 8. Structural load diagnosis: ESLint's own reading of meta.schema, and the plugin package a rule id names.
check(JSON.stringify(optionsSchema([{ enum: ["a"] }], 9)) === JSON.stringify({ type: "array", items: [{ enum: ["a"] }], minItems: 0, maxItems: 1 }), "positional schema");
check(JSON.stringify(optionsSchema(undefined, 9)) === JSON.stringify({ type: "array", minItems: 0, maxItems: 0 }) && optionsSchema(undefined, 8) === null && optionsSchema(false, 9) === null, "no schema: no options from ESLint 9, unvalidated before; false: unvalidated");
check(JSON.stringify(pluginPart("@eslint-community/eslint-comments/no-use")) === JSON.stringify({ pkg: "@eslint-community/eslint-plugin-eslint-comments", name: "no-use" }) && pluginPart("quotes") === null && pluginPart("@typescript-eslint/x").pkg === "@typescript-eslint/eslint-plugin", "pluginPart");

// 9. TypeScript on the date-matched path comes from the TypeScript parser's own peer range: a TypeScript release
//    newer than that range (measured: typescript 7.0.2 against @typescript-eslint/parser 8.72.1, ERESOLVE) is never
//    asked for; npm installs the newest TypeScript the range admits at the date.
const tsDocs = { ...docs, "@typescript-eslint/parser": { time: { "8.72.1": T("2024-04-01") }, peers: { "8.72.1": { eslint: "^8.57.0 || ^9.0.0", typescript: ">=4.8.4 <6.1.0" } } },
  typescript: { time: { "5.4.5": T("2024-03-01"), "6.0.3": T("2024-03-20"), "7.0.2": T("2024-04-02") } } };
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: tsDocs });
  const r = await installFor({ id: "DX03", linter: "eslint", readings: [reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(r.installed.kind === "installed" && r.install.path === "date-matched", `TypeScript from the parser's range: ${JSON.stringify(r.install).slice(0, 300)}`);
  check(r.install.versions?.typescript === "6.0.3" && r.install.versions?.["@typescript-eslint/parser"] === "8.72.1", `TypeScript 6.0.3, not 7.0.2: ${JSON.stringify(r.install.versions)}`);
}

// 13. A parser that marks TypeScript an optional peer (5.x): npm installs none, so the runner adds TypeScript with the
//     range the lockfile's parser entry declares, and says so.
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps, calls } = fakes({ registryDocs: { ...tsDocs, "@typescript-eslint/parser": { time: { "5.62.0": T("2023-07-01") },
    peers: { "5.62.0": { eslint: "^6.0.0 || ^7.0.0 || ^8.0.0", typescript: "*", typescript_optional: true } } } } });
  const r = await installFor({ id: "DX05", linter: "eslint", readings: [reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(r.install.versions?.typescript === "7.0.2" && r.install.versions?.eslint === "8.57.0" && r.install.typescript_from_peer_range === true,
    `optional TypeScript peer: added with the parser's range, ESLint the newest the parser admits: ${JSON.stringify(r.install.versions)} ${r.install.typescript_from_peer_range}`);
  check(calls.npm.some((a) => a.includes("--before")) && !calls.npm.some((a) => a.includes("--legacy-peer-deps")), "no --legacy-peer-deps on the date-matched path");
}

// 10. npm's error is decided by the code in its --json output, never by words in its stderr.
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: tsDocs });
  const seen = [];
  deps.npm = (args, cwd) => {
    seen.push(args.includes("--json"));
    return { code: 1, stdout: JSON.stringify({ error: { code: "E404", summary: "Not found" } }), stderr: "ERESOLVE --legacy-peer-deps" };
  };
  const r = await installFor({ id: "DX04", linter: "eslint", readings: [reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(seen.length === 1 && seen.every(Boolean), `one npm call, with --json, and no retry on an E404 whose stderr names ERESOLVE: ${seen}`);
  check(r.install.attempts.at(-1).failure?.tool?.code === "E404" && r.install.attempts.at(-1).failure?.cause === "package-not-found", `the parsed code decides the cause: ${JSON.stringify(r.install.attempts).slice(0, 300)}`);
}

// 11. The sha-rev rule reads files, not the failure's words: with another pin file at the root (which the kit reads
//     first) the failure is left as it is.
{
  const dir = repo({ ".pre-commit-config.yaml": "repos:\n  - repo: https://github.com/astral-sh/ruff-pre-commit\n    rev: f12be1ebaa5351c1fc76472de98db2c3446c8253\n", "requirements-dev.txt": "ruff==0.0.0\n" });
  const { deps } = fakes({ ruff: { "0.4.1": [{ upload_time_iso_8601: T("2024-04-01") }] } });
  const inst = deps.install;
  deps.install = (l, d) => (existsSync(path.join(d, "requirements-date-matched-ruff.txt")) ? inst(l, d) : { kind: "not-installed", stage: "install", reason: "uvx exited 1: something else" });
  const r = await installFor({ id: "DR2", linter: "ruff", readings: [] }, dir, deps);
  check(r.installed.kind === "not-installed" && !(r.install.adjustments ?? []).includes("pre-commit-rev-not-a-release"), `another pin file at the root: the sha rev is not what failed: ${JSON.stringify(r.install)}`);
  const dir2 = repo({ ".pre-commit-config.yaml": "repos:\n  - repo: https://github.com/astral-sh/ruff-pre-commit\n    rev: f12be1ebaa5351c1fc76472de98db2c3446c8253\n" });
  const r2 = await installFor({ id: "DR3", linter: "ruff", readings: [] }, dir2, deps);
  check(r2.installed.kind === "installed" && (r2.install.adjustments ?? []).includes("pre-commit-rev-not-a-release"), "the pre-commit rev is the only pin file: the no-pin rule applies whatever the failure says");
}

// 14. A planted pair that is TypeScript asks for the TypeScript parser, whatever sits at the root (measured, D14: 32
//     sub-readings stopped at «Parsing error» because only a root tsconfig.json or a typescript-eslint rule asked for
//     it). On the lockfile-pinned path the parser and TypeScript come from the same lockfile as ESLint.
const tsPair = (dirName = "src") => ({ bad: { path: `${dirName}/p/bad.ts`, text: "interface A { x: number }\n" }, good: { path: `${dirName}/p/good.ts`, text: "const a = 1;\n" } });
const jsPair = { bad: { path: "p/bad.js", text: "x\n" }, good: { path: "p/good.js", text: "y\n" } };
{
  const lock = { lockfileVersion: 3, packages: { "": {}, "node_modules/eslint": { version: "9.2.0" },
    "node_modules/@typescript-eslint/parser": { version: "8.1.0" }, "node_modules/typescript": { version: "5.4.5" } } };
  const dir = repo({ "web/package.json": JSON.stringify({ devDependencies: { eslint: "^9", "@typescript-eslint/parser": "^8", typescript: "^5" } }),
    "web/package-lock.json": JSON.stringify(lock), "web/src/a.ts": "x\n", "web/tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: docs });
  const r = await installFor({ id: "DX14", linter: "eslint", readings: [{ ...reading("anthropic-s1", "no-console"), pair: tsPair("web") }] }, dir, deps);
  check(r.install.path === "lockfile-pinned" && r.install.versions?.["@typescript-eslint/parser"] === "8.1.0" && r.install.versions?.typescript === "5.4.5",
    `a .ts pair with no root tsconfig.json: the lockfile's own parser and TypeScript: ${JSON.stringify(r.install.versions)}`);
  check(JSON.stringify(r.install.ts_parser_asked) === JSON.stringify(["typescript-pair"]), `why the parser was asked is recorded: ${JSON.stringify(r.install.ts_parser_asked)}`);
  const js = await installFor({ id: "DX14b", linter: "eslint", readings: [{ ...reading("anthropic-s1", "no-console"), pair: jsPair }] }, dir, fakes({ registryDocs: docs }).deps);
  check(!js.install.versions?.["@typescript-eslint/parser"] && js.install.ts_parser_asked === undefined, `a .js pair asks for no parser: ${JSON.stringify(js.install.versions)}`);
}

// 15. The same on the date-matched path: no tsconfig.json anywhere, a .ts pair.
{
  const dir = repo({ "README.md": "x\n", "app/x.ts": "x\n" });
  const { deps, calls } = fakes({ registryDocs: { ...docs, "@typescript-eslint/parser": { time: { "8.1.0": T("2024-04-01") }, peers: { "8.1.0": { typescript: ">=4.7.4 <5.5.0" } } }, typescript: { time: { "5.4.5": T("2024-04-02"), "5.5.2": T("2024-04-03") } } } });
  const r = await installFor({ id: "DX15", linter: "eslint", readings: [{ ...reading("google-s1", "no-console"), pair: tsPair("app") }] }, dir, deps);
  check(r.install.path === "date-matched" && r.install.versions?.["@typescript-eslint/parser"] === "8.1.0" && r.install.versions?.typescript === "5.4.5",
    `date-matched, .ts pair: parser and TypeScript at the date: ${JSON.stringify(r.install.versions)}`);
  check(calls.npm.some((a) => a.includes("--before")) && JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).devDependencies?.["@typescript-eslint/parser"] === "*",
    "the parser is in npm's manifest with the range *, npm --before picks it");
}

// 16. Whether another root file pins Ruff is the Ruff kit's own answer (vigiles' ruffPin, which the install reads),
//     not a second reading of the requirement line: a requirement with an environment marker is no exact pin to the
//     kit, so the pre-commit sha rev is what the install used and failed on.
{
  const dir = repo({ ".pre-commit-config.yaml": "repos:\n  - repo: https://github.com/astral-sh/ruff-pre-commit\n    rev: f12be1ebaa5351c1fc76472de98db2c3446c8253\n",
    "requirements-dev.txt": 'ruff==0.3.0 ; python_version >= "3.8"\n' });
  const { deps } = fakes({ ruff: { "0.4.1": [{ upload_time_iso_8601: T("2024-04-01") }] } });
  const r = await installFor({ id: "DR4", linter: "ruff", readings: [] }, dir, deps);
  check(r.install.attempts[0].failure?.cause === "tool-resolve" && r.installed.kind === "installed",
    `a marker requirement is no pin to the kit: the sha rev decides (tool-resolve): ${JSON.stringify(r.install.attempts)}`);
  check(otherRuffPin(repo({ "requirements.txt": "ruff==0.4.1\n" })) === true && otherRuffPin(repo({ "pyproject.toml": '[project]\noptional-dependencies = { dev = ["ruff>=0.4"] }\n' })) === false
    && otherRuffPin(repo({ "uv.lock": 'version = 1\n[[package]]\nname = "ruff"\nversion = "0.4.1"\n' })) === true, "the kit's pin: exact requirement yes, a range no, a lockfile entry yes");
}

// 17. yarn.lock read by its own parsers: v1 by @yarnpkg/lockfile, Berry (YAML with __metadata) by js-yaml; a key
//     holds several descriptors, a scoped name keeps its leading «@».
{
  const y1 = '# yarn lockfile v1\n\n\n"@typescript-eslint/parser@^8.0.0", "@typescript-eslint/parser@^8.1.0":\n  version "8.1.0"\n  resolved "x"\n\neslint-plugin-x@^1:\n  version "1.0.0"\n\neslint@^8.0.0, eslint@^8.57.0:\n  version "8.57.0"\n  resolved "x"\n';
  check(lockedVersion("yarn.lock", y1, ".", "@typescript-eslint/parser") === "8.1.0" && lockedVersion("yarn.lock", y1, ".", "eslint") === "8.57.0", "yarn v1: scoped and plain names");
  const berry = '__metadata:\n  version: 8\n  cacheKey: 10c0\n\n"@typescript-eslint/parser@npm:^8.0.0, @typescript-eslint/parser@npm:^8.2.0":\n  version: 8.2.0\n  resolution: "@typescript-eslint/parser@npm:8.2.0"\n\n"eslint@npm:^9.0.0":\n  version: 9.1.1\n  resolution: "eslint@npm:9.1.1"\n\n"eslint-config-x@workspace:packages/x":\n  version: 0.0.0-use.local\n';
  check(lockedVersion("yarn.lock", berry, ".", "@typescript-eslint/parser") === "8.2.0" && lockedVersion("yarn.lock", berry, ".", "eslint") === "9.1.1" && lockedVersion("yarn.lock", berry, ".", "eslint-config-x") === null,
    "yarn Berry: several descriptors in one key, a workspace version is no release");
  let threw = false;
  try { lockedVersion("yarn.lock", "eslint@^8:\n  version \"8\n", ".", "eslint"); } catch { threw = true; }
  check(threw, "a yarn.lock neither parser reads is an error, not a guess (the caller records no pin)");
}

// 18. Why a planted pair did not run, from structure: the pair's file type and whether the reading has a parser
//     (stage parse); ESLint's own config matching asked of the installed ESLint (stage pair-ignored).
{
  check(pairCauseOf("parse", { pair_ts: true, parser: null, eslint: null }) === "no-ts-parser-in-install", "a .ts pair, no parser: no-ts-parser-in-install");
  check(pairCauseOf("parse", { pair_ts: true, parser: "@typescript-eslint/parser", eslint: null }) === "parse-other", "a parser was there: parse-other");
  check(pairCauseOf("pair-ignored", { pair_ts: true, parser: null, eslint: null }) === "unknown", "no answer from ESLint: unknown");
  const eslintDir = path.dirname(createRequire(import.meta.url).resolve("eslint/package.json"));
  const fixture = () => { const d = repo({ "README.md": "x\n" }); mkdirSync(path.join(d, "node_modules"), { recursive: true }); symlinkSync(eslintDir, path.join(d, "node_modules", "eslint"), "dir"); return d; };
  const pinned = { dir: fixture(), version: "10.14.0" };
  const ask = (files, ignores, pair) => pairCheck(pinned, { linter: "eslint", rule: "no-console", options: [], scope: { files, ignores } }, pair, { kind: "not-run", stage: "pair-ignored" });
  const dirOnly = ask(["app/**"], [], tsPair("app"));
  check(dirOnly.cause === "pair-unconfigured" && dirOnly.eslint?.bad?.files_only === false, `a directory-only pattern takes no .ts file (ESLint's own answer): ${JSON.stringify(dirOnly)}`);
  const ignored = ask(["app/**/*.ts"], ["app/p/**"], tsPair("app"));
  check(ignored.cause === "pair-in-ignores" && ignored.eslint?.bad?.files_only === true && ignored.eslint?.bad?.full === false, `files take it, ignores drop it: ${JSON.stringify(ignored)}`);
  const parse = pairCheck(pinned, { linter: "eslint", rule: "no-console", options: [], scope: { files: ["app/**/*.ts"], ignores: [] } }, tsPair("app"), { kind: "not-run", stage: "parse" });
  check(parse.cause === "no-ts-parser-in-install" && parse.eslint === null, `parse: decided without running anything: ${JSON.stringify(parse)}`);
  for (const pc of [dirOnly, ignored, parse]) { const v = pairCheckSchema.safeParse(pc); check(v.success, `pair check has the declared shape: ${v.success ? "" : JSON.stringify(v.error.issues).slice(0, 300)}`); }
  check(!pairCheckSchema.safeParse({ ...parse, cause: "guessed" }).success, "a pair cause outside the closed list is refused");
  check(needsTsParser(repo({ "README.md": "x\n" }), [{ reading: { rule: "no-console" }, pair: tsPair() }]).join() === "typescript-pair"
    && needsTsParser(repo({ "tsconfig.json": "{}" }), [{ reading: { rule: "@typescript-eslint/no-explicit-any" }, pair: jsPair }]).join() === "root-tsconfig,typescript-eslint-rule"
    && needsTsParser(repo({ "README.md": "x\n" }), [{ reading: { rule: "no-console" }, pair: jsPair }]).length === 0, "needsTsParser: what asked for the parser");
}

// 19. The date-matched path (D10 by the package managers' own date flags, R15): every package npm installs has the
//     range "*" and is picked by npm --before <the commit's committer time in UTC>; the versions recorded are the ones
//     in the lockfile npm wrote (transitive packages are dated too: they are npm's to pick).
{
  const dir = repo({ "README.md": "x\n" });
  const { deps, calls } = fakes({ registryDocs: docs });
  const r = await installFor({ id: "DX19", linter: "eslint", readings: [reading("google-s1", "check-file/folder-naming-convention")] }, dir, deps);
  const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).devDependencies;
  check(JSON.stringify(manifest) === JSON.stringify({ eslint: "*", "eslint-plugin-check-file": "*" }), `the manifest names the packages, npm picks the versions: ${JSON.stringify(manifest)}`);
  check(calls.npm.length > 0 && calls.npm.every((a) => a.split(" ").includes("--before") && a.includes("2024-04-12T00:00:00.000Z")), `npm --before the commit time (UTC): ${JSON.stringify(calls.npm)}`);
  check(r.install.versions?.eslint === "9.0.0" && r.install.plugins?.["eslint-plugin-check-file"]?.version === "2.6.0", `versions read back from npm's lockfile: ${JSON.stringify(r.install.versions)} ${JSON.stringify(r.install.plugins)}`);
  check(JSON.stringify(r.install.date_matched_by) === JSON.stringify({ tool: "npm", flag: "--before", at: "2024-04-12T00:00:00.000Z" }), `the record names the tool and the time: ${JSON.stringify(r.install.date_matched_by)}`);
}

// 20. A plugin whose ESLint peer excludes the newest ESLint at the date: npm picks the newest ESLint the plugin admits
//     (measured: 2024-06-01, eslint 8.57.0 with eslint-plugin-import 2.29.1); no
//     --legacy-peer-deps.
{
  const dir = repo({ "README.md": "x\n" });
  const { deps, calls } = fakes({ registryDocs: { ...docs, "eslint-plugin-import": { time: { "2.29.1": T("2023-12-14") }, peers: { "2.29.1": { eslint: "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8" } } } } });
  const r = await installFor({ id: "DX20", linter: "eslint", readings: [reading("deepseek-s1", "import/no-cycle"), reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(r.install.versions?.eslint === "8.57.0" && r.install.plugins?.["eslint-plugin-import"]?.version === "2.29.1", `ESLint the plugin admits: ${JSON.stringify(r.install.versions)}`);
  check(!calls.npm.some((a) => a.includes("--legacy-peer-deps")) && r.install.legacy_peer_deps !== true, "no --legacy-peer-deps");
}

// 21. Ruff with no pin: uv pip compile --exclude-newer <commit time> --format pylock.toml; the version is read from the
//     pylock file by a TOML parser; the record names the tool and the time.
{
  const dir = repo({ "pyproject.toml": "[project]\nname = \"x\"\n" });
  const { deps, calls } = fakes({ ruff: { "0.4.1": [{ upload_time_iso_8601: T("2024-04-01") }], "0.4.2": [{ upload_time_iso_8601: T("2024-04-30") }] } });
  const inst = deps.install;
  deps.install = (l, d) => (existsSync(path.join(d, "requirements-date-matched-ruff.txt")) ? inst(l, d) : { kind: "not-installed", stage: "no-pin", reason: "no ruff pin" });
  const r = await installFor({ id: "DR21", linter: "ruff", readings: [] }, dir, deps);
  check(r.installed.kind === "installed" && r.install.date_matched?.ruff === "0.4.1" && calls.uv.join() === "2024-04-12T00:00:00.000Z",
    `uv --exclude-newer at the commit time picks Ruff: ${JSON.stringify(r.install)} uv ${calls.uv}`);
  check(JSON.stringify(r.install.date_matched_by) === JSON.stringify({ tool: "uv", flag: "--exclude-newer", at: "2024-04-12T00:00:00.000Z" }), `the record names uv: ${JSON.stringify(r.install.date_matched_by)}`);
}

// 22. uv that finds no Ruff by the date fails the attempt with uv's own command and exit status, cause «unknown»
//     (uv reports no structured code that tells a network failure from an empty resolution).
{
  const dir = repo({ "pyproject.toml": "[project]\nname = \"x\"\n" });
  const { deps } = fakes({ ruff: { "0.5.0": [{ upload_time_iso_8601: T("2024-06-01") }] } });
  deps.install = () => ({ kind: "not-installed", stage: "no-pin", reason: "no ruff pin" });
  const r = await installFor({ id: "DR22", linter: "ruff", readings: [] }, dir, deps);
  const f = r.install.attempts.at(-1).failure;
  check(r.installed.kind === "not-installed" && f?.cause === "unknown" && f?.tool?.cmd?.startsWith("uv pip compile") && f?.tool?.exit === 1,
    `uv's failure recorded with its command and exit: ${JSON.stringify(r.install.attempts)}`);
}

// 12. Every install record any fixture above produced has the declared shape, and the committed JSON Schema is the
//     one install-schema.mjs generates.
{
  const committed = JSON.parse(readFileSync(new URL("./install-result.schema.json", import.meta.url), "utf8"));
  check(JSON.stringify(committed) === JSON.stringify(jsonSchema()), "install-result.schema.json is generated from install-schema.mjs (node install-schema.mjs --write)");
  for (const [i, r] of seenInstalls.entries()) {
    const v = installSchema.safeParse(r);
    check(v.success, `install record ${i} has the declared shape: ${v.success ? "" : JSON.stringify(v.error.issues).slice(0, 300)}`);
  }
  check(!installSchema.safeParse({ ...seenInstalls[0], attempts: [{ path: "as-designed", outcome: "not-installed", failure: { stage: "detect", cause: "no-lock", detail: "" } }] }).success, "a cause outside the closed list is refused");
  check(seenInstalls.length >= 12, `records checked: ${seenInstalls.length}`);
  check(JSON.stringify(committed.$defs?.pair_check) === JSON.stringify(jsonSchema().$defs?.pair_check) && committed.$defs?.pair_check?.properties?.cause, "the pair check is in the emitted schema");
}

// 5. The repository's own ESLint declarations.
check(JSON.stringify(repoEslint(repo({ "package.json": "{}", "a/package.json": JSON.stringify({ devDependencies: { eslint: "8" } }) })).declared) === JSON.stringify(["a/package.json"]), "repoEslint finds a sub-package");

if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: date-matched by npm --before and uv --exclude-newer at the commit time, versions read back from npm's lockfile and uv's pylock.toml, ESLint the newest a plugin's peer admits, no --legacy-peer-deps on that path, TypeScript from the parser's peer range; no-lockfile fixture -> date-matched with plugins recorded per reading, an unknown plugin an error, an unresolvable peer a plugin-not-installed; lockfile fixture -> as-designed, nothing fetched; no ESLint of its own -> date-matched, marked; Ruff sha rev -> no-pin rule; a .ts pair asks for the TypeScript parser (lockfile-pinned, date-matched); the Ruff pin is the kit's own answer; yarn v1 and Berry by their parsers; why a pair did not run, from structure and ESLint's config matching");
