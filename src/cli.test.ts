/**
 * cli.ts paths the harness (src/cli.harness.mjs) does not reach: argument parsing of the flags
 * `build`/`toolchain` take, the root settings' refusals, `build` and `new` refusing before any
 * work, the hook runner when its runtime is broken, and venue choice by path and by prefix. Each
 * case runs `run()` in-process with its own `cwd` and compares the whole code and output.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.mjs";
import { chooseVenue, parseArgs, parseSettings, run, runHook } from "./cli.ts";

const root = useTempDir("cli-test-");

/** `run(argv)` from `cwd`, the output as one string per stream. */
async function cli(argv: string[], cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: (...a: unknown[]) => err.push(a.join(" ")),
    cwd,
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("parseArgs: the boolean flags of build and toolchain, and a value flag with no value", () => {
  const base = parseArgs([]);
  assert.deepEqual(
    [
      parseArgs(["build", "--all", "--dry-run", "papers/p"]),
      parseArgs(["toolchain", "--check"]),
      parseArgs(["new", "x", "--format"]),
      parseArgs(["new", "x", "--venue="]),
      parseArgs(["new", "x", "--kind", "short", "--max-warnings=3"]),
    ],
    [
      { ...base, cmd: "build", all: true, dryRun: true, paths: ["papers/p"] },
      { ...base, cmd: "toolchain", check: true },
      { ...base, cmd: "new", paths: ["x"], missingValue: "--format" },
      { ...base, cmd: "new", paths: ["x"], missingValue: "--venue" },
      { ...base, cmd: "new", paths: ["x"], kind: "short", maxWarnings: 3 },
    ],
  );
});

test("parseSettings refuses a non-object, names one unknown key or several, and a mistyped default", () => {
  const error = (json: unknown) => {
    const r = parseSettings(json, "paperlint.json", "/r");
    return r.ok ? null : r.error.split(" — ")[0];
  };
  assert.deepEqual(
    [
      error([]),
      error("x"),
      error({ typo: 1 }),
      error({ a: 1, b: 2 }),
      error({ kind: 3 }),
    ],
    [
      "paperlint.json: must be a JSON object",
      "paperlint.json: must be a JSON object",
      'paperlint.json: unknown key "typo"',
      'paperlint.json: unknown keys "a", "b"',
      'paperlint.json: "kind" must be a non-empty string, got 3',
    ],
  );
});

test("build refuses with no target, and --all over no papers", async () => {
  const dir = join(root, "build-empty");
  writeTree(dir, { "package.json": "{}" });
  assert.deepEqual(
    [await cli(["build"], dir), await cli(["build", "--all"], dir)],
    [
      {
        code: 2,
        out: "",
        err:
          "`build` needs a target: `paperlint build papers/my-paper` or `paperlint build --all`.\n" +
          'There is deliberately no "build everything" default: a build is expensive and has side\n' +
          "effects, so the target is named — as with make, docker and latexmk.",
      },
      {
        code: 1,
        out: "",
        err: `--all: no papers found under ${join(dir, "papers")}`,
      },
    ],
  );
});

test("new refuses an unknown format, a broken config, and a config that names no papers directory", async () => {
  const broken = join(root, "new-broken");
  writeTree(broken, { "paperlint.json": "{ not json" });
  const none = join(root, "new-none");
  writeTree(none, { "paperlint.json": JSON.stringify({ papersDir: [] }) });
  const results = [
    await cli(["new", "p", "--format", "docx"], root),
    await cli(["new", "p", "--format", "md"], broken),
    await cli(["new", "p", "--format", "md"], none),
  ];
  assert.deepEqual(
    results.map((r) => ({ code: r.code, err: r.err.split(":")[0] })),
    [
      { code: 2, err: "--format must be one of tex, md — got `docx`" },
      { code: 2, err: join(broken, "paperlint.json is not valid JSON") },
      {
        code: 2,
        err: '"papersDir" names no directory, so there is nowhere to put `p`.',
      },
    ],
  );
});

test("new with several papers directories says which one it used", async () => {
  const dir = join(root, "new-several");
  writeTree(dir, {
    "paperlint.json": JSON.stringify({ papersDir: ["a", "b"] }),
  });
  const r = await cli(["new", "p", "--format", "md", "--yes"], dir);
  assert.equal(
    r.out.split("\n")[0],
    "several papers directories are declared — using the first: a",
  );
});

test("runHook: a runtime with no cli.js beside it, and a hook killed by a signal, both let the tool call through", () => {
  const messages: string[] = [];
  const noCli = runHook("paper-edit-guard", {
    err: (m: string) => messages.push(m.split("\n")[0] ?? ""),
    resolve: () => join(root, "nowhere", "index.js"),
  });
  const killed = runHook("paper-edit-guard", {
    err: (m: string) => messages.push(m),
    run: (() => ({ status: null, signal: "SIGKILL" })) as never,
  });
  assert.deepEqual(
    { noCli, killed, messages: messages.map((m) => m.split(" from ")[0]) },
    {
      noCli: 0,
      killed: 0,
      messages: ["paperlint: the hook runtime (vigiles) is not resolvable"],
    },
  );
});

test("chooseVenue: a preset by path (inside and outside the paper), by prefixed name, and a broken one", async () => {
  const dir = join(root, "venues");
  writeTree(dir, {
    "papers/p/mine.jsonc": JSON.stringify({ extends: "paperlint:agenticdev" }),
    "shared/ours.jsonc": JSON.stringify({ extends: "paperlint:agenticdev" }),
    "shared/broken.jsonc": "{ nope",
  });
  const paperDir = join(dir, "papers", "p");
  const choose = (venue: string) =>
    chooseVenue(
      { venue, kind: null },
      { paperDir, cwd: dir, interactive: false, ask: async () => "" },
    );
  const results = await Promise.all([
    choose("./papers/p/mine.jsonc"),
    choose("./shared/ours.jsonc"),
    choose("paperlint:agenticdev"),
    choose("./shared/broken.jsonc"),
  ]);
  assert.deepEqual(
    results.map((r) => (r.ok ? r.value?.extends : r.error.split(":")[0])),
    [
      "./mine.jsonc",
      "../../shared/ours.jsonc",
      "paperlint:agenticdev",
      "--venue ./shared/broken.jsonc",
    ],
  );
});

test("doctor reads a broken config as 'the CLI would lint nothing' instead of stopping", async () => {
  const dir = join(root, "doctor-broken");
  writeTree(dir, { "paperlint.json": "{ not json" });
  const r = await cli(["doctor"], dir);
  const lines = r.out.split("\n");
  const at = lines.indexOf("papers directory");
  assert.deepEqual(
    { code: r.code, papers: lines.slice(at, at + 3) },
    {
      code: 2,
      papers: [
        "papers directory",
        "  the CLI will lint    (nothing — no declaration found)",
        "  the hooks will guard (nothing — the guard refuses and says why on first use)",
      ],
    },
  );
});

/** Run with no TeX Live anywhere: PATH holds node alone, the cache is an empty directory. */
async function withoutTex<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, {
    PATH: dirname(process.execPath),
    PAPERLINT_TEXLIVE_DIR: join(dir, "no-texlive"),
    PAPERLINT_BANAL_DIR: join(dir, "no-banal"),
    HOME: dir,
  });
  try {
    return await fn();
  } finally {
    process.env = saved;
  }
}

test("build: a markdown-only paper is refused; with no TeX Live a dry run says where a real run stops, and a real run stops", async () => {
  const dir = join(root, "build-notex");
  writeTree(dir, {
    "package.json": "{}",
    "papers/md/paper.md": "# P\n\nx\n",
    "papers/tex/paper.tex":
      "\\documentclass{article}\\begin{document}x\\end{document}\n",
  });
  const [md, dry, real, toolchain] = await withoutTex(dir, async () => [
    await cli(["build", "papers/md"], dir),
    await cli(["build", "papers/tex", "--dry-run"], dir),
    await cli(["build", "papers/tex"], dir),
    await cli(["toolchain", "--check"], dir),
  ]);
  const venues = join(
    import.meta.dirname,
    "..",
    "skills",
    "submit-paper",
    "references",
    "venues",
  );
  const missing =
    "missing: 19 package(s): amsfonts, amsmath, bibtex, booktabs, caption, cm-super, enumitem, geometry, graphics, hyperref, latex, microtype, natbib, pgf, seqsplit, tools, url, xcolor, xurl";
  assert.deepEqual(
    { md, dry, real, toolchain: { code: toolchain.code } },
    {
      md: {
        code: 1,
        out: [
          "papers/md",
          `  inputs: TEXINPUTS += ${venues}`,
          "  compile: refused — no paper.tex; paperlint compiles LaTeX, and this paper has none",
          "  measure: skipped — nothing is compiled",
          "  references: skipped — nothing is compiled",
          "  ✗ nothing to compile: no paper.tex",
        ].join("\n"),
        err:
          "\nNo paper.tex in: papers/md.\n" +
          'This is NOT "nothing to build" — paperlint compiles LaTeX, and these papers have no LaTeX source.\n' +
          "Write the paper in paper.tex; `paperlint new <name>` creates one.",
      },
      dry: {
        code: 0,
        out: [
          `engine: none — a real run would stop here: paperlint build: no TeX Live with every package these papers need — run \`npx paperlint toolchain\` (${missing})`,
          "papers/tex",
          `  inputs: TEXINPUTS += ${venues}`,
          "  compile: paper.tex (\\documentclass{article})",
          "  measure: pdf.js → _build/paper.facts.json (facts for the lint rules; nothing is judged here)",
          "  references: online: citations exist, titles and authors match → _build/references.json (never fails the build)",
          "  – not run (--dry-run)",
        ].join("\n"),
        err: "",
      },
      real: {
        code: 1,
        out: "",
        err: `✗ paperlint build: no TeX Live with every package these papers need — run \`npx paperlint toolchain\` (${missing})`,
      },
      toolchain: { code: 1 },
    },
  );
});
