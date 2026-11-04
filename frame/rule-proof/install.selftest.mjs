// Selftest of run.mjs's install paths on planted repository fixtures, offline: the registry, npm and the linter
// install are fakes, so nothing is fetched and nothing from a fixture runs.
//   node frame/rule-proof/install.selftest.mjs   (exit 1 on a defect)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { optionsSchema, pluginPart } from "./diagnose.mjs";
import { installFor, lockedVersion, matrixOf, npmDateMatched, readingPlugins, repoEslint } from "./run.mjs";

const fail = [];
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
        if (bad && !args.includes("--legacy-peer-deps")) return { code: 1, stderr: "npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree" };
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
  check(r.install.as_designed?.stage === "no-lockfile", "the as-designed failure is kept with its stage");
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
  check(r.install.as_designed?.stage === "no-linter" && r.install.path === "date-matched", `no-linter fixture: ${JSON.stringify(r.install)}`);
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
  check(r.install.as_designed?.stage === "no-lockfile" && calls.registry.length === 0, "nothing asked of the registry on the lockfile-pinned path");
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

// 5. The plan job's matrix: one entry per item, Node 22 unless the item names another (from the repository's engines).
check(JSON.stringify(matrixOf([{ id: "a" }, { id: "b", node: "20" }])) === JSON.stringify([{ index: 0, node: "22" }, { index: 1, node: "20" }]), "matrixOf");
check(JSON.stringify(repoEslint(repo({ "package.json": "{}", "a/package.json": JSON.stringify({ devDependencies: { eslint: "8" } }) })).declared) === JSON.stringify(["a/package.json"]), "repoEslint finds a sub-package");

if (fail.length) { console.log("FAIL:\n  " + fail.join("\n  ")); process.exit(1); }
console.log("ok: npm date-matched versions; no-lockfile fixture -> date-matched with plugins recorded per reading, an unknown plugin an error, a peer conflict marked; lockfile fixture -> as-designed, nothing fetched; no ESLint of its own -> date-matched, marked; Ruff sha rev -> no-pin rule; matrix Node per item");
