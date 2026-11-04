// Selftest of run.mjs's install paths on planted repository fixtures, offline: the registry, npm and the linter
// install are fakes, so nothing is fetched and nothing from a fixture runs.
//   node frame/rule-proof/install.selftest.mjs   (exit 1 on a defect)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { optionsSchema, pluginPart } from "./diagnose.mjs";
import { installSchema, jsonSchema, pairCheckSchema } from "./install-schema.mjs";
import { installFor as installForReal, lockedVersion, matrixOf, needsTsParser, npmDateMatched, otherRuffPin, pairCauseOf, pairCheck, readingPlugins, repoEslint } from "./run.mjs";

const fail = [];
const seenInstalls = [];
const installFor = async (...a) => { const r = await installForReal(...a); seenInstalls.push(r.install); return r; };
const check = (ok, what) => { if (!ok) fail.push(what); };
const T = (d) => `${d}T00:00:00.000Z`;

// npm: the highest release published on or before the commit, no pre-release.
const time = { created: T("2013-06-01"), modified: T("2026-10-01"), "8.57.0": T("2024-02-23"), "9.0.0": T("2024-04-05"),
  "9.1.0-rc.0": T("2024-04-10"), "9.1.0": T("2024-04-19"), "8.57.1": T("2024-09-16") };
check(npmDateMatched(time, T("2024-04-12")) === "9.0.0", `npmDateMatched ${npmDateMatched(time, T("2024-04-12"))}: 9.0.0`);
check(npmDateMatched(time, T("2024-10-01")) === "9.1.0", "a backport published later (8.57.1) does not beat 9.1.0");
check(npmDateMatched(time, T("2010-01-01")) === null, "no release before the date: null");

function repo(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-fixture-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    writeFileSync(path.join(dir, p), text);
  }
  return dir;
}

// Fakes. The install stands in for vigiles' rp.install: it installs only from a lockfile, and finds ESLint only when
// the lockfile's package.json depends on it, as the real kit does.
function fakes({ registryDocs = {}, ruff = {} } = {}) {
  const calls = { registry: [], npm: [], install: [] };
  return {
    calls,
    deps: {
      install: (linter, dir) => {
        calls.install.push(linter);
        if (linter === "ruff") {
          const req = existsSync(path.join(dir, "requirements-date-matched-ruff.txt"));
          return req ? { kind: "installed", linter: { version: "0.4.1", dir } }
            : { kind: "not-installed", stage: "install", reason: `uvx exited 1: Distribution not found at: file://${dir}/f12be1ebaa5351c1fc76472de98db2c3446c8253` };
        }
        if (!existsSync(path.join(dir, "package-lock.json"))) return { kind: "not-installed", stage: "no-lockfile", reason: "no lockfile" };
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
        const v = (pkg.devDependencies ?? {}).eslint ?? (pkg.dependencies ?? {}).eslint;
        return v ? { kind: "installed", linter: { version: v, dir } } : { kind: "not-installed", stage: "no-linter", reason: "no eslint" };
      },
      registry: async (name) => { calls.registry.push(name); return registryDocs[name] ?? null; },
      ruffReleases: async () => ruff,
      npm: (args, cwd) => {
        calls.npm.push(args.join(" "));
        const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
        const bad = Object.keys(pkg.devDependencies).find((n) => n === "eslint-plugin-conflicts");
        if (bad && !args.includes("--legacy-peer-deps")) return { code: 1, stdout: JSON.stringify({ error: { code: "ERESOLVE", summary: "unable to resolve dependency tree" } }), stderr: "npm error see the log" };
        writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": pkg } }));
        return { code: 0, stderr: "" };
      },
      commitIso: () => T("2024-04-12"),
      asideDir: mkdtempSync(path.join(tmpdir(), "rp-aside-")),
    },
  };
}

const reading = (key, rule) => ({ key, reading: { linter: "eslint", rule, options: [], scope: { files: [], ignores: [] } } });
const item = { id: "DX01", linter: "eslint", rule: "no-tabs", readings: [reading("anthropic-s1", "no-tabs"),
  reading("google-s1", "check-file/folder-naming-convention"), reading("deepseek-s1", "nonexistent/x"),
  reading("deepseek-s2", "conflicts/y")] };
const docs = { eslint: { time }, "eslint-plugin-check-file": { time: { "2.6.0": T("2023-08-01"), "2.8.0": T("2024-04-20") } },
  "eslint-plugin-conflicts": { time: { "1.0.0": T("2022-01-01") } } };

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
  check(p["eslint-plugin-nonexistent"]?.version === null && /not on the npm registry/.test(p["eslint-plugin-nonexistent"]?.error ?? ""), "a plugin npm does not have is an error, not a drop");
  check(p["eslint-plugin-conflicts"]?.version === "1.0.0" && p["eslint-plugin-conflicts"]?.peer_conflict === true, "a peer conflict installs with legacy peer deps and says so");
  check(existsSync(path.join(deps.asideDir, ".npmrc")) && existsSync(path.join(deps.asideDir, "package.json")), "the repository's package.json and .npmrc are set aside, outside the repository");
  check(!existsSync(path.join(dir, ".npmrc")) || readFileSync(path.join(dir, ".npmrc"), "utf8") === "legacy-peer-deps=true\n", "only our own .npmrc sits in the repository");
  const rp = Object.fromEntries(item.readings.map((x) => [x.key, readingPlugins(x.reading, r.install)]));
  check(JSON.stringify(rp["anthropic-s1"]) === "[]", "a core rule names no plugin");
  check(rp["google-s1"][0]?.name === "eslint-plugin-check-file" && rp["google-s1"][0]?.version === "2.6.0", `reading plugins ${JSON.stringify(rp["google-s1"])}`);
  check(rp["deepseek-s1"][0]?.version === null && rp["deepseek-s1"][0]?.error, "a reading whose plugin did not install carries the error");
  check(calls.registry.includes("eslint"), "the registry was asked");
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

// 9. A TypeScript release newer than the parser's peer range (measured: typescript 7.0.2 against
//    @typescript-eslint/parser 8.72.1, npm ERESOLVE): TypeScript is left to npm's peer resolution, and said so.
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: { ...docs, "@typescript-eslint/parser": { time: { "8.72.1": T("2024-04-01") } },
    typescript: { time: { "7.0.2": T("2024-04-02") } } } });
  const npm = deps.npm;
  deps.npm = (args, cwd) => {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    if (pkg.devDependencies.typescript === "7.0.2" && !args.includes("--legacy-peer-deps"))
      return { code: 1, stdout: JSON.stringify({ error: { code: "ERESOLVE" } }), stderr: "npm error see the log" };
    const r = npm(args, cwd);
    const lock = JSON.parse(readFileSync(path.join(cwd, "package-lock.json"), "utf8"));
    lock.packages["node_modules/typescript"] = { version: "6.0.3" };
    writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify(lock));
    return r;
  };
  const r = await installFor({ id: "DX03", linter: "eslint", readings: [reading("anthropic-s1", "no-tabs")] }, dir, deps);
  check(r.installed.kind === "installed" && r.install.path === "date-matched", `TypeScript peer conflict: ${JSON.stringify(r.install).slice(0, 300)}`);
  check(r.install.versions?.typescript === "6.0.3" && r.install.typescript_peer_resolved === true, `TypeScript from the parser's peer range, recorded: ${JSON.stringify(r.install.versions)}`);
  check(r.install.attempts.at(-1).resolved?.[0]?.cause === "peer-conflict-typescript", "the attempt says which conflict it resolved");
}

// 10. npm's error is decided by the code in its --json output, never by words in its stderr.
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: { ...docs, "@typescript-eslint/parser": { time: { "8.72.1": T("2024-04-01") } },
    typescript: { time: { "7.0.2": T("2024-04-02") } } } });
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

// 13. A TypeScript peer conflict and then a plugin that needs --legacy-peer-deps (measured on two items): legacy mode
//     installs no peers, so the TypeScript npm chose is pinned explicitly and survives.
{
  const dir = repo({ "package.json": "{}", "package-lock.json": "{}", "tsconfig.json": "{}" });
  const { deps } = fakes({ registryDocs: { ...docs, "@typescript-eslint/parser": { time: { "8.70.0": T("2024-04-01") } },
    typescript: { time: { "7.0.2": T("2024-04-02") } } } });
  const npm = deps.npm;
  deps.npm = (args, cwd) => {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    if (pkg.devDependencies.typescript === "7.0.2") return { code: 1, stdout: JSON.stringify({ error: { code: "ERESOLVE" } }), stderr: "" };
    const r = npm(args, cwd);
    if (r.code !== 0) return r;
    const lock = JSON.parse(readFileSync(path.join(cwd, "package-lock.json"), "utf8"));
    const legacy = args.includes("--legacy-peer-deps");
    if (!legacy || pkg.devDependencies.typescript) lock.packages["node_modules/typescript"] = { version: pkg.devDependencies.typescript ?? "6.0.3" };
    writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify(lock));
    return r;
  };
  const r = await installFor({ id: "DX05", linter: "eslint", readings: [reading("anthropic-s1", "conflicts/y")] }, dir, deps);
  check(r.install.legacy_peer_deps === true && r.install.versions?.typescript === "6.0.3", `TypeScript kept explicit under --legacy-peer-deps: ${JSON.stringify(r.install.versions)}`);
  check(JSON.stringify(r.install.attempts.at(-1).resolved?.map((x) => x.cause)) === JSON.stringify(["peer-conflict-typescript", "peer-conflict-other"]), `both conflicts recorded: ${JSON.stringify(r.install.attempts.at(-1).resolved)}`);
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
  const { deps, calls } = fakes({ registryDocs: { ...docs, "@typescript-eslint/parser": { time: { "8.1.0": T("2024-04-01") } }, typescript: { time: { "5.4.5": T("2024-04-02") } } } });
  const r = await installFor({ id: "DX15", linter: "eslint", readings: [{ ...reading("google-s1", "no-console"), pair: tsPair("app") }] }, dir, deps);
  check(r.install.path === "date-matched" && r.install.versions?.["@typescript-eslint/parser"] === "8.1.0" && r.install.versions?.typescript === "5.4.5",
    `date-matched, .ts pair: parser and TypeScript at the date: ${JSON.stringify(r.install.versions)}`);
  check(calls.registry.includes("@typescript-eslint/parser"), "the registry was asked for the parser");
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

// 5. The plan job's matrix: one entry per item, Node 22 unless the item names another (from the repository's engines).
check(JSON.stringify(matrixOf([{ id: "a" }, { id: "b", node: "20" }])) === JSON.stringify([{ index: 0, node: "22" }, { index: 1, node: "20" }]), "matrixOf");
check(JSON.stringify(repoEslint(repo({ "package.json": "{}", "a/package.json": JSON.stringify({ devDependencies: { eslint: "8" } }) })).declared) === JSON.stringify(["a/package.json"]), "repoEslint finds a sub-package");

if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: npm date-matched versions; no-lockfile fixture -> date-matched with plugins recorded per reading, an unknown plugin an error, a peer conflict marked; lockfile fixture -> as-designed, nothing fetched; no ESLint of its own -> date-matched, marked; Ruff sha rev -> no-pin rule; matrix Node per item; a .ts pair asks for the TypeScript parser (lockfile-pinned, date-matched); the Ruff pin is the kit's own answer; yarn v1 and Berry by their parsers; why a pair did not run, from structure and ESLint's config matching");
