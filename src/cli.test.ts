/**
 * cli.ts paths the harness (src/cli.harness.mjs) does not reach: argument parsing of the flags
 * `build`/`toolchain` take, the root settings' refusals, `build` and `new` refusing before any
 * work, the hook runner when its runtime is broken, and venue choice by path and by prefix. Each
 * case runs `run()` in-process with its own `cwd` and compares the whole code and output.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "vitest";
import {
  runNode,
  useTempDir,
  venuePreset,
  writeTree,
} from "../test/support.ts";
import type { runToolchain } from "./toolchain.ts";
import {
  chooseVenue,
  initTexLive,
  paperRuleBlocks,
  parseArgs,
  parseSettings,
  run,
  runHook,
  silentOptionalRules,
  toolchainTex,
} from "./cli.ts";
import { texInputsDir } from "./package-dirs.ts";

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

test("🔴 parseSettings refuses a mistyped `structure` instead of letting `lint` crash on it", () => {
  // Guards: `markers: 5` used to pass the boundary, and `checkStructure` then threw
  // "rules.markers.some is not a function" from inside `paperlint lint`.
  for (const structure of [{ markers: 5 }, "yes", { requireOneOf: ["a"] }]) {
    const r = parseSettings({ structure }, "paperlint.json", "/r");
    assert.equal(r.ok, false, JSON.stringify(structure));
    assert.match(r.error, /^paperlint\.json: "structure" must be false/);
  }
  const off = parseSettings({ structure: false }, "paperlint.json", "/r");
  assert.equal(off.ok && off.value.structure, false);
});

test("parseSettings refuses `talk` in the root file: it is one paper's setting", () => {
  const r = parseSettings(
    { talk: { mode: "remote-video" } },
    "paperlint.json",
    "/r",
  );
  assert.equal(
    r.ok ? null : r.error,
    "paperlint.json: \"talk\" is a paper's setting — set it in that paper's paperlint.json",
  );
});

test("parseSettings refuses `submission` in the root file: a submission is one paper's", () => {
  const r = parseSettings({ submission: { id: 7 } }, "paperlint.json", "/r");
  assert.equal(
    r.ok ? null : r.error,
    "paperlint.json: \"submission\" is a paper's setting — set it in that paper's paperlint.json",
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
    run: () => ({ status: null, signal: "SIGKILL" }),
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
    "papers/p/mine.jsonc": JSON.stringify(
      venuePreset("mine", { extends: "paperlint:agenticdev" }),
    ),
    "shared/ours.jsonc": JSON.stringify(
      venuePreset("ours", { extends: "paperlint:agenticdev" }),
    ),
    "shared/broken.jsonc": "{ nope",
  });
  const paperDir = join(dir, "papers", "p");
  const choose = (venue: string) =>
    chooseVenue(
      { venue, kind: null },
      {
        paperDir,
        cwd: dir,
        interactive: false,
        ask: () => Promise.resolve(""),
      },
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

const noTexDir = join(root, "build-notex");
writeTree(noTexDir, {
  "package.json": "{}",
  "papers/md/paper.md": "# P\n\nx\n",
  "papers/tex/paper.tex":
    "\\documentclass{article}\\begin{document}x\\end{document}\n",
});
const venues = texInputsDir();

test("build: a markdown-only paper is refused", async () => {
  const md = await withoutTex(noTexDir, () =>
    cli(["build", "papers/md"], noTexDir),
  );
  assert.deepEqual(md, {
    code: 1,
    out: [
      "papers/md",
      `  inputs: TEXINPUTS += the paper's directory, then ${venues}`,
      "  compile: refused — no paper.tex; paperlint compiles LaTeX, and this paper has none",
      "  measure: skipped — nothing is compiled",
      "  references: skipped — nothing is compiled",
      "  ✗ nothing to compile: no paper.tex",
    ].join("\n"),
    err:
      "\nNo paper.tex in: papers/md.\n" +
      'This is NOT "nothing to build" — paperlint compiles LaTeX, and these papers have no LaTeX source.\n' +
      "Write the paper in paper.tex; `paperlint new <name>` creates one.",
  });
});

test("build: with no TeX Live a dry run says where a real run stops, and a real run stops", async () => {
  const [dry, real, toolchain] = await withoutTex(noTexDir, async () => [
    await cli(["build", "papers/tex", "--dry-run"], noTexDir),
    await cli(["build", "papers/tex"], noTexDir),
    await cli(["toolchain", "--check"], noTexDir),
  ]);
  const missing =
    "missing: 19 package(s): amsfonts, amsmath, bibtex, booktabs, caption, cm-super, enumitem, geometry, graphics, hyperref, latex, microtype, natbib, pgf, seqsplit, tools, url, xcolor, xurl";
  assert.deepEqual(
    { dry, real, toolchain: { code: toolchain.code } },
    {
      dry: {
        code: 0,
        out: [
          `engine: none — a real run would stop here: paperlint build: no TeX Live with every package these papers need — run \`npx paperlint toolchain\` (${missing})`,
          "papers/tex",
          `  inputs: TEXINPUTS += the paper's directory, then ${venues}`,
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

const BIN = join(import.meta.dirname, "..", "bin", "paperlint.mjs");

test("no command prints the usage and exits 2; --kind with no value is refused", async () => {
  const r = await cli([], root);
  assert.equal(r.code, 2);
  assert.match(r.out, /^paperlint — /);
  assert.equal(parseArgs(["new", "x", "--kind"]).missingValue, "--kind");
});

test("src/cli.ts run as the program itself answers like the bin", () => {
  const r = runNode(join(import.meta.dirname, "cli.ts"), ["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^paperlint — /);
});

test("build and toolchain over a broken or empty declaration", async () => {
  const broken = writeTree(join(root, "build-broken"), {
    "paperlint.json": "{ nope",
  });
  const empty = writeTree(join(root, "build-none"), {
    "paperlint.json": JSON.stringify({ papersDir: [] }),
  });
  const b = await cli(["build", "--all"], broken);
  const e = await cli(["build", "--all"], empty);
  assert.deepEqual(
    [b.code, e],
    [
      2,
      {
        code: 1,
        out: "config: paperlint.json",
        err: "--all: no papers found under (nothing declared)",
      },
    ],
  );
  // A config that does not parse contributes no paper to the toolchain: the shipped presets only.
  assert.deepEqual(toolchainTex(broken), toolchainTex(empty));
});

test("build --dry-run on a paper with a venue plans for the preset's packages", async () => {
  const dir = writeTree(join(root, "build-venue"), {
    "package.json": "{}",
    "papers/v/paper.tex":
      "\\documentclass{acmart}\\begin{document}x\\end{document}\n",
    "papers/v/paperlint.json": JSON.stringify({ extends: "paperlint:aisec" }),
  });
  const r = await withoutTex(dir, () =>
    cli(["build", "papers/v", "--dry-run"], dir),
  );
  assert.equal(r.code, 0);
  assert.match(r.out, /^engine: none — a real run would stop here: .*acmart/);
});

test("a paper's paperlint.json that does not parse stops the lint with its path", () => {
  const dir = writeTree(join(root, "rules-broken"), {
    "p/paper.md": "# P\n",
    "p/paperlint.json": "{ nope",
  });
  const r = paperRuleBlocks([join(dir, "p")]);
  assert.equal(r.ok, false);
  assert.match(r.error, /^.*rules-broken\/p\/paperlint\.json: /);
});

test("silentOptionalRules: a config with no rules turns nothing on", async () => {
  const eslint = { calculateConfigForFile: () => Promise.resolve(undefined) };
  assert.deepEqual(await silentOptionalRules(eslint, [], {}), []);
});

const lastPageOn = {
  rules: [
    { basePath: ".", rules: { "pdf/last-page-balance": "error" as const } },
  ],
};
const eslintWith = (rules: Record<string, unknown>) => ({
  calculateConfigForFile: () => Promise.resolve({ rules }),
});

test("silentOptionalRules: a rule on for a paper is reached", async () => {
  const eslint = eslintWith({ "pdf/last-page-balance": [2, {}] });
  assert.deepEqual(
    await silentOptionalRules(eslint, ["p/paper.tex"], lastPageOn),
    [],
  );
});

test("silentOptionalRules: a rule a paper's own block turns off is reached — the way out of a preset's", async () => {
  const eslint = eslintWith({ "pdf/last-page-balance": [0] });
  assert.deepEqual(
    await silentOptionalRules(eslint, ["p/paper.tex"], lastPageOn),
    [],
  );
});

test("silentOptionalRules: a rule no block names for any paper is silent — a glob that matched nothing", async () => {
  assert.deepEqual(
    await silentOptionalRules(eslintWith({}), ["p/paper.tex"], lastPageOn),
    ["pdf/last-page-balance"],
  );
});

test("init with no path and --format md sets up the current directory", async () => {
  const dir = writeTree(join(root, "init-here"), { "package.json": "{}" });
  const r = await cli(
    ["init", "--yes", "--no-hooks", "--paper", "first", "--format", "md"],
    dir,
  );
  assert.equal(
    existsSync(join(dir, "papers", "first", "paper.md")),
    true,
    r.out + r.err,
  );
});

test("init and doctor with a declaration that names no directory: nothing to compare", async () => {
  const dir = writeTree(join(root, "init-empty"), {
    "package.json": "{}",
    "paperlint.json": JSON.stringify({ papersDir: [] }),
  });
  const d = await cli(["doctor"], dir);
  assert.match(
    d.out,
    / {2}the CLI will lint {4}\(nothing — no declaration found\)/,
  );
});

test("lint: an empty papers directory that IS the working directory is named '.'", async () => {
  const dir = writeTree(join(root, "lint-dot"), {
    "paperlint.json": JSON.stringify({ papersDir: "." }),
  });
  const r = await cli(["lint"], dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /^no papers in \./);
});

test("lint: a named directory with nothing paperlint lints is named in full when it is the working directory", async () => {
  const dir = writeTree(join(root, "lint-nothing"), { "notes.txt": "x" });
  const r = await cli(["lint", "."], dir);
  assert.deepEqual(r.code, 1);
  assert.match(r.err, new RegExp(`^nothing was linted under ${dir} — `));
});

test("new from inside the paper it names adds the missing files and names the paper in full", async () => {
  const dir = writeTree(join(root, "new-inside"), {
    "paperlint.json": JSON.stringify({ papersDir: "papers" }),
    "papers/p/paper.md": "# P\n",
  });
  const r = await cli(
    ["new", "p", "--format", "md", "--yes"],
    join(dir, "papers", "p"),
  );
  assert.match(
    r.out,
    new RegExp(
      `already there, only missing files added: ${join(dir, "papers", "p")}`,
    ),
  );
});

test("new with several directories, run from the first, names it in full", async () => {
  const dir = writeTree(join(root, "new-several-inside"), {
    "paperlint.json": JSON.stringify({ papersDir: ["a", "b"] }),
    "a/.keep": "",
  });
  const r = await cli(["new", "p", "--format", "md", "--yes"], join(dir, "a"));
  assert.equal(
    r.out.split("\n")[0],
    `several papers directories are declared — using the first: ${join(dir, "a")}`,
  );
});

test("lint: an ESLint failure that is not an empty set is not swallowed", async () => {
  const dir = writeTree(join(root, "lint-bad-option"), {
    "paperlint.json": JSON.stringify({
      rules: { "paper/stages": ["error", { x: 1 }] },
    }),
    "papers/p/paper.md": "# P\n",
    "papers/p/PIPELINE-STATUS.md": "---\nstages: []\n---\n# S\n",
  });
  await assert.rejects(cli(["lint"], dir), {
    message:
      /Key "paper\/stages":\n\tValue \[\{"x":1\}\] should NOT have more than 0 items/,
  });
});

test("lint: a path that shares nothing with the project but the filesystem root is still linted", async () => {
  // The temp project lives under the OS temp directory and the fixture in this repository: the
  // only directory holding both is `/`, and ESLint runs from there.
  const paper = join(
    import.meta.dirname,
    "..",
    "fixtures",
    "paper-stages",
    "ok",
  );
  const r = await cli(["lint", paper], root);
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /stage «submitted» \(2026-07-22\) carries no frozen source/,
  );
});

/**
 * `new` at a terminal: stdin and stdout claim to be TTYs (a preload), and each prompt is answered
 * when it appears — a pipe written all at once is swallowed by the first question.
 */
function newAtTerminal(cwd: string, answers: Record<string, string>) {
  const tty = join(root, "tty.mjs");
  writeTree(root, {
    "tty.mjs":
      'Object.defineProperty(process.stdin, "isTTY", { value: true });\n' +
      'Object.defineProperty(process.stdout, "isTTY", { value: true });\n',
  });
  return new Promise<{ status: number | null; out: string }>((done) => {
    const child = spawn(
      process.execPath,
      ["--import", tty, BIN, "new", "first"],
      {
        cwd,
        env: { ...process.env, CI: "" },
      },
    );
    let out = "";
    const asked = new Set<string>();
    child.stdout.on("data", (d: Buffer) => {
      out += String(d);
      for (const [prompt, answer] of Object.entries(answers)) {
        if (asked.has(prompt) || !out.includes(prompt)) continue;
        asked.add(prompt);
        child.stdin.write(answer);
      }
    });
    child.on("close", (status) => {
      done({ status, out });
    });
  });
}

test("new at a terminal asks for the format and the venue; the answers pick them", async () => {
  const md = writeTree(join(root, "new-tty-md"), { "package.json": "{}" });
  const r = await newAtTerminal(md, { "format:": "md\n", "venue:": "none\n" });
  assert.equal(r.status, 0, r.out);
  assert.equal(existsSync(join(md, "papers", "first", "paper.md")), true);
});

test("chooseVenue: a question that fails (the stream ended) takes the default, no venue", async () => {
  const r = await chooseVenue(parseArgs(["new", "x"]), {
    paperDir: join(root, "x"),
    cwd: root,
    interactive: true,
    ask: () => Promise.reject(new Error("Aborted with Ctrl+D")),
  });
  assert.deepEqual(r, { ok: true, value: null });
});

test("init's TeX Live install runs the toolchain over the project's papers, never a check", () => {
  const dir = writeTree(join(root, "init-tex"), { "package.json": "{}" });
  const calls: Parameters<typeof runToolchain>[0][] = [];
  const fake: typeof runToolchain = (o) => (calls.push(o), 0);
  const log = () => {};
  const here = initTexLive(
    parseArgs(["init"]),
    { log, err: log, cwd: dir },
    fake,
  );
  const there = initTexLive(
    parseArgs(["init", "sub"]),
    { log, err: log, cwd: dir },
    fake,
  );
  assert.deepEqual([here.install(), there.install()], [0, 0]);
  assert.deepEqual(
    calls.map((c) => [c.check, c.tex, typeof c.banal]),
    [
      [false, toolchainTex(dir), "object"],
      [false, toolchainTex(join(dir, "sub")), "object"],
    ],
  );
  assert.equal(typeof here.installed(), "boolean");
});

test("lint with its LaTeX language missing from the install still lints the markdown papers", () => {
  const dir = writeTree(join(root, "lint-no-tex-language"), {
    "papers/p/paper.md": "# P\n\nSome prose.\n",
    "no-latex.mjs":
      "import { register } from 'node:module';\n" +
      "register('data:text/javascript,' + encodeURIComponent(\"export async function resolve(s, c, next) { if (s === '#eslint-rules/latex-language') throw Object.assign(new Error('gone'), { code: 'ERR_MODULE_NOT_FOUND' }); return next(s, c); }\"));\n",
  });
  const without = runNode(BIN, ["lint", "papers"], {
    cwd: dir,
    nodeArgs: ["--import", join(dir, "no-latex.mjs")],
  });
  const whole = runNode(BIN, ["lint", "papers"], { cwd: dir });
  // A markdown paper needs no LaTeX language: the same report, the same code.
  assert.deepEqual(without, whole);
  assert.match(whole.stdout, /missing `PIPELINE-STATUS\.md`/);
});

test("`paperlint hook` with no name: exit 2, and the usage names an example", async () => {
  assert.deepEqual(await cli(["hook"], root), {
    code: 2,
    out: "",
    err: "`hook` needs a name, e.g. `paperlint hook paper-edit-guard`",
  });
});

test("parseSettings refuses a root `identity` that is not a list of words, and takes one that is", () => {
  const bad = parseSettings({ identity: "Ada" }, "paperlint.json", "/r");
  assert.deepEqual(bad, {
    ok: false,
    error:
      'paperlint.json: "identity" must be a list of strings, each with a letter or digit, got "Ada"',
  });
  assert.equal(
    parseSettings({ identity: ["Ada Example"] }, "paperlint.json", "/r").ok,
    true,
  );
});

test("parseArgs: submission's flags — two values and two switches", () => {
  assert.deepEqual(
    parseArgs([
      "submission",
      "update",
      "papers/p",
      "--pdf=build/p.pdf",
      "--abstract",
      "abs.txt",
      "--submit",
      "--save",
    ]),
    {
      ...parseArgs([]),
      cmd: "submission",
      paths: ["update", "papers/p"],
      pdf: "build/p.pdf",
      abstract: "abs.txt",
      submit: true,
      save: true,
    },
  );
  assert.equal(
    parseArgs(["submission", "update", "--pdf"]).missingValue,
    "--pdf",
  );
});

/** A paper whose venue's HotCRP portal is `site`, submission 7, with a paper.pdf. */
const submissionPaper = (dir: string, site: string): void => {
  writeTree(dir, {
    "package.json": "{}",
    "venue.jsonc": JSON.stringify(
      venuePreset("venue", {
        extends: "paperlint:aidc",
        portal: { kind: "hotcrp", url: site },
      }),
    ),
    "papers/p/paperlint.json": JSON.stringify({
      extends: "../../venue.jsonc",
      submission: { id: 7 },
    }),
    "papers/p/paper.pdf": "%PDF fake",
  });
};

test("🔴 submission: without HOTCRP_TOKEN it names the variable and asks the portal nothing", async () => {
  const dir = join(root, "submission-no-token");
  submissionPaper(dir, "http://127.0.0.1:9");
  const saved = process.env["HOTCRP_TOKEN"];
  delete process.env["HOTCRP_TOKEN"];
  try {
    const r = await cli(["submission", "show", "papers/p"], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /^HOTCRP_TOKEN is not set — /);
  } finally {
    if (saved !== undefined) process.env["HOTCRP_TOKEN"] = saved;
  }
});

test("submission show: through the HotCRP adapter to a local portal, the token in the header only", async () => {
  const seen: { url: string; auth: string }[] = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: req.headers.authorization ?? "" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        paper: { object: "paper", pid: 7, status: "submitted", title: "T" },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const dir = join(root, "submission-show");
  submissionPaper(dir, `http://127.0.0.1:${String(address.port)}`);
  const saved = process.env["HOTCRP_TOKEN"];
  process.env["HOTCRP_TOKEN"] = "hct_cli_test";
  try {
    const r = await cli(["submission", "show"], join(dir, "papers/p"));
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(seen, [
      { url: "/api/paper?p=7&word_limit=hard", auth: "bearer hct_cli_test" },
    ]);
    assert.match(
      r.out,
      /^submission 7 on http:\/\/127\.0\.0\.1:\d+ \(hotcrp\)$/m,
    );
    assert.match(r.out, /^match {9}NO — the portal holds no PDF$/m);
    assert.doesNotMatch(r.out + r.err, /hct_cli_test/);
  } finally {
    if (saved === undefined) delete process.env["HOTCRP_TOKEN"];
    else process.env["HOTCRP_TOKEN"] = saved;
    await new Promise<void>((r) => {
      server.close(() => {
        r();
      });
    });
  }
});
