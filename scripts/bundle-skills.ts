#!/usr/bin/env node
/**
 * `npm run build`'s second step: bundle every script a skill runs, so it runs with no
 * `node_modules` at all — a Claude Code plugin copy is the tarball unpacked without its
 * dependencies, and there a script that imports `zod` or `#src/…` dies with `ERR_MODULE_NOT_FOUND`
 * before it reads its arguments (test/e2e/install/skill-scripts.e2e.ts measures it).
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────────────────────
 * Each entry's bundle is written BESIDE its source as `<name>.js` — the path the skill already
 * runs: `headings.ts` → `headings.js` (replacing tsc's output of the same name), `verify-cites.mjs`
 * → `verify-cites.js`. Code two entries share goes to one chunk folder, `dist/skill-chunks/`, which
 * every entry imports by a relative path. The checkout, a consumer's `node_modules` and a plugin
 * copy all hold the same tree, so the same `node ${CLAUDE_SKILL_DIR}/scripts/<name>.js` runs in all
 * three. Every output is a build output: gitignored, shipped by `files`, never a tracked file — the
 * step refuses before writing anything if one would be.
 *
 * ── `import.meta` IN A MODULE THAT IS NOT THE ENTRY ─────────────────────────────────────────
 * Inside one bundle every module's `import.meta.url` is the bundle's. Two things break: a main
 * guard (`isMain(import.meta.url)`) is true for EVERY module, so a bundle would run a second
 * module's `main()`; and a module that finds the package's data from its own location
 * (`src/package-dirs.ts`) looks beside the bundle instead. So in every module of this repository
 * other than the entry, `import.meta.url`, `.dirname` and `.filename` are rewritten to the module's
 * own source location, relative to the output file it lands in (the source tree ships too). The
 * entry keeps its own: its bundle sits where its source does. Any other use of `import.meta` is
 * refused, and so is an entry that another bundled module imports (its code would leave its file).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  build,
  type BuildOptions,
  type Metafile,
  type OutputFile,
  type Plugin,
} from "esbuild";
import ts from "typescript";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** The scripts the skills run (`node ${CLAUDE_SKILL_DIR}/…` in a SKILL.md), as their sources. */
export const SKILL_ENTRIES: readonly string[] = [
  "skills/argument-arc/scripts/headings.ts",
  "skills/build-label-page/scripts/label-page.ts",
  "skills/cold-read-diff/scripts/cold-read.ts",
  "skills/label-agent-runs/scripts/labels.ts",
  "skills/paper-pipeline/scripts/extract-ref-facts.mjs",
  "skills/pc-panel-review/scripts/prior-reviews.ts",
  "skills/run-agent-grid/scripts/grid-guard.ts",
  "skills/verify-citations/scripts/bib-authors.mjs",
  "skills/verify-citations/scripts/verify-cites.mjs",
];

/** Where the code shared by two or more entries goes, below the package root. */
export const CHUNK_DIR = "dist/skill-chunks";

/** What one run bundles, and the one effect it asks the world: which paths git tracks. */
export interface BundlePlan {
  readonly root: string;
  /** Entry sources, relative to `root`. */
  readonly entries: readonly string[];
  /** The chunk folder, relative to `root`; emptied and refilled by every run. */
  readonly chunkDir: string;
  /** Of `paths` (relative to `root`), the ones git tracks. */
  readonly tracked: (
    root: string,
    paths: readonly string[],
  ) => readonly string[];
}

/**
 * CommonJS dependencies call `require` and read `__dirname`; an ES module has neither, so each
 * output file defines them first.
 */
const BANNER = [
  `import { createRequire as __plCreateRequire } from "node:module";`,
  `import { fileURLToPath as __plFileURLToPath } from "node:url";`,
  `import { dirname as __plDirname } from "node:path";`,
  `const require = __plCreateRequire(import.meta.url);`,
  `const __filename = __plFileURLToPath(import.meta.url);`,
  `const __dirname = __plDirname(__filename);`,
].join("\n");

/** `path` relative to `root`, with forward slashes. */
const posix = (root: string, path: string): string =>
  relative(root, path).split(sep).join("/");

/**
 * Stands for "the package root, relative to this output file" in a rewritten module, until the
 * file the module lands in (an entry's bundle or a chunk) is known; replaced in every output.
 */
const ROOT_TOKEN = "__PAPERLINT_BUNDLE_ROOT__";

/**
 * What each kept `import.meta` property becomes, given the expression for the module's own URL.
 * `__plFileURLToPath` and `__plDirname` are the BANNER's imports, at the top of every output file.
 */
const KEPT: Readonly<Record<string, (url: string) => string>> = {
  url: (url) => url,
  filename: (url) => `__plFileURLToPath(${url})`,
  dirname: (url) => `__plDirname(__plFileURLToPath(${url}))`,
};

/** One `import.meta` in a module: its span, and the property read (`""` for a bare `import.meta`). */
interface MetaUse {
  readonly start: number;
  readonly end: number;
  readonly property: string;
}

/** Every `import.meta` in `code`, found by the TypeScript parser: a comment that quotes one is not one. */
function metaUses(code: string, file: string): readonly MetaUse[] {
  const kind = file.endsWith("ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const visit = (node: ts.Node): readonly MetaUse[] => {
    if (
      !ts.isMetaProperty(node) ||
      node.keywordToken !== ts.SyntaxKind.ImportKeyword
    )
      return node.getChildren(source).flatMap(visit);
    const parent = node.parent;
    const read =
      ts.isPropertyAccessExpression(parent) && parent.expression === node;
    const span = read ? parent : node;
    return [
      {
        start: span.getStart(source),
        end: span.end,
        property: read ? parent.name.text : "",
      },
    ];
  };
  return visit(source);
}

/** `code` of the module at `file`, its `import.meta` rewritten to the module's own source location. */
function keptLocation(code: string, file: string, root: string): string {
  const rel = posix(root, file);
  const url = `new URL(${JSON.stringify(`${ROOT_TOKEN}/${rel}`)}, import.meta.url).href`;
  const uses = metaUses(code, file).map((u) => ({
    ...u,
    as: KEPT[u.property],
  }));
  const kept = uses.filter(
    (u): u is MetaUse & { as: (url: string) => string } => u.as !== undefined,
  );
  const lost = uses.filter((u) => u.as === undefined);
  if (lost.length > 0)
    throw new Error(
      lost
        .map(
          (u) =>
            `${rel}: ${u.property ? `import.meta.${u.property}` : "import.meta"} cannot be kept correct inside a bundle`,
        )
        .join("\n"),
    );
  return kept.reduceRight(
    (text, u) => text.slice(0, u.start) + u.as(url) + text.slice(u.end),
    code,
  );
}

/** The esbuild plugin that applies `keptLocation` to every module of this tree but the entries. */
const keepOwnLocation = (
  root: string,
  entries: ReadonlySet<string>,
): Plugin => ({
  name: "keep-own-location",
  setup(b) {
    b.onLoad({ filter: /\.[cm]?[jt]s$/ }, (args) => {
      const foreign = args.path.split(sep).includes("node_modules");
      if (foreign || entries.has(args.path)) return undefined;
      const code = readFileSync(args.path, "utf8");
      if (!code.includes("import.meta")) return undefined;
      const loader = args.path.endsWith("ts") ? "ts" : "js";
      return { contents: keptLocation(code, args.path, root), loader };
    });
  },
});

/** An output file's text with `ROOT_TOKEN` replaced by the way from its folder to the root. */
const located = (root: string, f: OutputFile): string =>
  f.text.replaceAll(ROOT_TOKEN, posix(dirname(f.path), root) || ".");

/** The paths of `paths` that git tracks in `root`; a failing git (no checkout) throws. */
export function gitTracked(
  root: string,
  paths: readonly string[],
): readonly string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\0").filter((p) => p !== "");
}

/** The entries some other bundled module imports, from esbuild's metafile. */
const importedEntries = (
  meta: Metafile,
  entries: readonly string[],
): readonly string[] =>
  entries.filter((e) =>
    Object.values(meta.inputs).some((input) =>
      input.imports.some((i) => i.path === e),
    ),
  );

/** Refuse a plan whose run would break an entry or overwrite a tracked file. */
function refusals(
  plan: BundlePlan,
  meta: Metafile,
  outputs: readonly string[],
): readonly string[] {
  const tracked = plan.tracked(plan.root, outputs);
  return [
    ...tracked.map(
      (p) => `${p} is tracked by git: a bundle must not overwrite it`,
    ),
    ...importedEntries(meta, plan.entries).map(
      (e) =>
        `${e} is an entry and is imported by another bundled module: its code would leave its own file`,
    ),
  ];
}

/**
 * esbuild's options for `plan`: one ES module per entry beside its source, shared code split into
 * `plan.chunkDir`, `#src/…` resolved to the sources, nothing written yet.
 */
const options = (
  plan: BundlePlan,
): BuildOptions & { readonly write: false; readonly metafile: true } => ({
  absWorkingDir: plan.root,
  entryPoints: plan.entries.map((e) => join(plan.root, e)),
  outdir: plan.root,
  outbase: plan.root,
  entryNames: "[dir]/[name]",
  chunkNames: `${plan.chunkDir}/[name]-[hash]`,
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  target: "node22",
  conditions: ["paperlint-source"],
  banner: { js: BANNER },
  plugins: [
    keepOwnLocation(
      plan.root,
      new Set(plan.entries.map((e) => join(plan.root, e))),
    ),
  ],
  write: false,
  metafile: true,
  logLevel: "silent",
});

/** Bundle `plan.entries`; returns the files written, relative to `plan.root`, sorted. */
export async function bundleSkills(
  plan: BundlePlan,
): Promise<readonly string[]> {
  const result = await build(options(plan));
  const files = result.outputFiles;
  const outputs = files.map((f) => posix(plan.root, f.path)).sort();
  const refused = refusals(plan, result.metafile, outputs);
  if (refused.length > 0)
    throw new Error(`bundle-skills: refused\n  ${refused.join("\n  ")}`);
  rmSync(join(plan.root, plan.chunkDir), { recursive: true, force: true });
  files.forEach((f) => {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, located(plan.root, f));
  });
  return outputs;
}

if (isMain(import.meta.url)) {
  const written = await bundleSkills({
    root: ROOT,
    entries: SKILL_ENTRIES,
    chunkDir: CHUNK_DIR,
    tracked: gitTracked,
  });
  // stderr: `npm pack --json` runs this as `prepare`, and its stdout must stay the JSON.
  process.stderr.write(
    `bundle-skills: wrote ${String(written.length)} files\n  ${written.join("\n  ")}\n`,
  );
}
