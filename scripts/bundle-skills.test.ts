/**
 * The bundle step (`scripts/bundle-skills.ts`) on fixture trees of its own: it writes every bundle
 * and nothing else, the bundles keep each module's own `import.meta`, and it refuses before writing
 * anything when a run would overwrite a tracked file or break an entry. Then the real step on this
 * checkout, as `npm run build` runs it.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { runNode, useTempDir, writeTree } from "../test/support.ts";
import {
  bundleSkills,
  CHUNK_DIR,
  gitTracked,
  SKILL_ENTRIES,
  type BundlePlan,
} from "./bundle-skills.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every file under `root`, relative, with its contents. */
function snapshot(root: string): Readonly<Record<string, string>> {
  const walk = (dir: string): readonly string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  return Object.fromEntries(
    walk(root).map((p) => [relative(root, p), readFileSync(p, "utf8")]),
  );
}

/** What changed between two snapshots. */
function delta(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): { added: string[]; removed: string[]; changed: string[] } {
  const keys = (o: object): string[] => Object.keys(o).sort();
  return {
    added: keys(after).filter((k) => !(k in before)),
    removed: keys(before).filter((k) => !(k in after)),
    changed: keys(after).filter((k) => k in before && before[k] !== after[k]),
  };
}

/** A module that reports where it thinks it is. */
const WHERE = `export const where = { url: import.meta.url, dirname: import.meta.dirname, filename: import.meta.filename };\n`;

/** A module with a main guard of its own, the shape of `isMain(import.meta.url)`. */
const GUARDED = `import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log("guarded main ran");
`;

/** Two entries sharing `lib/where.mjs`; the first also imports a guarded module. */
function fixture(extra: Readonly<Record<string, string>> = {}): string {
  return writeTree(useTempDir("paperlint-bundle-"), {
    "package.json": `{ "type": "module" }\n`,
    "app/one/main.ts": `import { where } from "../../lib/where.mjs";\nimport "../../lib/guarded.mjs";\nconst n: string = "one";\nconsole.log(JSON.stringify({ entry: n, ...where }));\n`,
    "app/two/main.mjs": `import { where } from "../../lib/where.mjs";\nconsole.log(JSON.stringify({ entry: "two", ...where }));\n`,
    "lib/where.mjs": WHERE,
    "lib/guarded.mjs": GUARDED,
    "out/chunks/stale.js": "stale\n",
    ...extra,
  });
}

const plan = (root: string, over: Partial<BundlePlan> = {}): BundlePlan => ({
  root,
  entries: ["app/one/main.ts", "app/two/main.mjs"],
  chunkDir: "out/chunks",
  tracked: () => [],
  ...over,
});

/** What `lib/where.mjs` must report about itself, wherever its code was bundled. */
const whereOf = (root: string, entry: string): Record<string, string> => ({
  entry,
  url: pathToFileURL(join(root, "lib", "where.mjs")).href,
  dirname: join(root, "lib"),
  filename: join(root, "lib", "where.mjs"),
});

describe("bundleSkills writes", () => {
  it("writes every entry's bundle beside its source and the shared chunks, and nothing else", async () => {
    const root = fixture();
    const before = snapshot(root);
    const written = await bundleSkills(plan(root));
    // Guards: the run's own report and the disk agree, the stale chunk is gone, no file was edited.
    expect(delta(before, snapshot(root))).toEqual({
      added: written,
      removed: ["out/chunks/stale.js"],
      changed: [],
    });
    // Guards: each entry's bundle sits beside its source as `.js`; every other output is a chunk.
    expect({
      entries: written.filter((p) => !p.startsWith("out/chunks/")),
      chunks: written.filter((p) => p.startsWith("out/chunks/")).length > 0,
    }).toEqual({
      entries: ["app/one/main.js", "app/two/main.js"],
      chunks: true,
    });
  });

  it("runs only the entry's own main, and each module keeps its own location", async () => {
    const root = fixture();
    await bundleSkills(plan(root));
    const run = (entry: string) =>
      runNode(join(root, entry), [], { cwd: root });
    // Guards: the guarded module's main did not run, and `where` names its own source, not the bundle.
    expect([run("app/one/main.js"), run("app/two/main.js")]).toEqual([
      {
        status: 0,
        stdout: `${JSON.stringify(whereOf(root, "one"))}\n`,
        stderr: "",
      },
      {
        status: 0,
        stdout: `${JSON.stringify(whereOf(root, "two"))}\n`,
        stderr: "",
      },
    ]);
  });
});

describe("bundleSkills refuses", () => {
  it("writing nothing, when an output is a tracked file", async () => {
    const root = fixture();
    const before = snapshot(root);
    const tracked = (_: string, paths: readonly string[]): readonly string[] =>
      paths.filter((p) => p === "app/one/main.js");
    // Guards: the refusal names the tracked path, and the tree is byte-identical afterwards.
    await expect(bundleSkills(plan(root, { tracked }))).rejects.toThrow(
      "bundle-skills: refused\n  app/one/main.js is tracked by git: a bundle must not overwrite it",
    );
    expect(snapshot(root)).toEqual(before);
  });

  it("an entry that another bundled module imports", async () => {
    const root = fixture();
    // Guards: an entry whose code would move into a chunk is named, not bundled.
    await expect(
      bundleSkills(
        plan(root, { entries: ["app/one/main.ts", "lib/where.mjs"] }),
      ),
    ).rejects.toThrow(
      "bundle-skills: refused\n  lib/where.mjs is an entry and is imported by another bundled module: its code would leave its own file",
    );
  });

  it.each([
    [
      "import.meta.resolve",
      `export const where = { r: import.meta.resolve("./x.mjs") };\n`,
      "import.meta.resolve",
    ],
    [
      "a bare import.meta",
      `export const where = { m: import.meta };\n`,
      "import.meta",
    ],
  ])("%s in a module that is not the entry", async (_, source, named) => {
    const root = fixture({ "lib/where.mjs": source });
    // Guards: a use of import.meta the step cannot keep correct is refused with the module's path.
    await expect(bundleSkills(plan(root))).rejects.toThrow(
      `lib/where.mjs: ${named} cannot be kept correct inside a bundle`,
    );
  });
});

describe("gitTracked", () => {
  it("names the tracked paths of those asked, and throws outside a checkout", () => {
    // Guards: a tracked file is reported, an absent one is not.
    expect(gitTracked(ROOT, ["package.json", "no-such-file.js"])).toEqual([
      "package.json",
    ]);
    // Guards: no checkout is an error, never "nothing is tracked".
    expect(() => gitTracked(useTempDir("paperlint-nogit-"), ["x"])).toThrow();
  });
});

describe("npm run build's bundle step, on this checkout", () => {
  it("writes every skill entry's bundle and touches no tracked file", () => {
    const status = (): string =>
      execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    const before = status();
    const r = runNode(join(ROOT, "scripts", "bundle-skills.ts"));
    const listed = r.stdout
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
    const bundles = SKILL_ENTRIES.map((e) => e.replace(/\.(ts|mjs)$/, ".js"));
    // Guards: the step succeeded and every entry's bundle is among what it wrote.
    expect({
      status: r.status,
      stderr: r.stderr,
      bundles: bundles.filter((b) => listed.includes(b)),
      others: listed.filter(
        (p) => !bundles.includes(p) && !p.startsWith(`${CHUNK_DIR}/`),
      ),
    }).toEqual({ status: 0, stderr: "", bundles, others: [] });
    // Guards: no tracked file changed.
    expect(status()).toBe(before);
  });
});
