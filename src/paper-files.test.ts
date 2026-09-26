/**
 * WHICH FILES `paperlint lint` LINTS — only the ones its own blocks claim, and a rule named in
 * `rules` reaches only the files it was written for.
 *
 * The defect this closes (found migrating a consumer project with vendored JS under a paper's
 * `repro/` folder): paperlint handed whole directories to ESLint, and ESLint's built-in defaults
 * then linted every `.js`/`.mjs`/`.cjs` under the papers directory. 1,877 vendored files produced
 * 74 errors — parse errors and "Definition for rule … was not found" — none of them on a paper
 * file, and the run failed. Nothing in the settings could turn that off.
 */
import { ESLint, type Linter } from "eslint";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildConfig, run } from "./cli.ts";
import {
  narrowToOwners,
  ownedPatterns,
  ruleOwners,
  scopeToOwned,
} from "./paper-files.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const TEX = "\\documentclass{article}\n\\begin{document}x\\end{document}\n";

/** A project with one paper `a` (paper.tex + PIPELINE-STATUS.md), plus `files`. */
function project(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-scope-")));
  dirs.push(root);
  const all: Record<string, string> = {
    "package.json": JSON.stringify({ name: "c", private: true }),
    "papers/a/paper.tex": TEX,
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    ...files,
  };
  for (const [p, text] of Object.entries(all)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

async function lint(
  root: string,
  args: string[] = [],
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["lint", "--json", ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const linted = (stdout: string): string[] =>
  (JSON.parse(stdout) as { filePath: string }[]).map((r) => r.filePath);

/** Vendored code under a paper: a syntax error, an unknown rule in a directive, plain CommonJS. */
const VENDORED = {
  "papers/a/repro/x.js": "return 1;\n",
  "papers/a/repro/y.mjs":
    "// eslint-disable-next-line import/no-nodejs-modules\nimport fs from 'node:fs';\n",
  "papers/a/repro/lib/z.cjs": "module.exports = 1;\n",
};

describe("paperlint lint — lints only the files paperlint owns", () => {
  it("🔴 vendored JS under a paper is never linted, and the run stays green", async () => {
    const r = await lint(project(VENDORED));
    expect(r.err).not.toMatch(/Parsing error|was not found/);
    const files = linted(r.out);
    expect(files.filter((f) => /\.[cm]?js$/.test(f))).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("…while the paper's own files ARE linted (the other half)", async () => {
    const root = project({
      ...VENDORED,
      "papers/a/reviews/r1.md": "# review\n",
    });
    const files = linted((await lint(root)).out);
    for (const f of [
      "papers/a/paper.tex",
      "papers/a/PIPELINE-STATUS.md",
      "papers/a/reviews/r1.md",
    ])
      expect(files).toContain(join(root, f));
  });

  it("a papers directory holding only vendored JS lints NOTHING — and says so", async () => {
    const root = project({
      "papers/a/paper.tex": "",
      ...VENDORED,
    });
    rmSync(join(root, "papers/a/paper.tex"));
    rmSync(join(root, "papers/a/PIPELINE-STATUS.md"));
    // From the config: the directory holds no paper, which is said before ESLint runs.
    const fromConfig = await lint(root);
    expect(fromConfig.code).toBe(2);
    expect(fromConfig.err).toMatch(/^no papers in papers\//);
    // Named on the command line: ESLint gets it, lints nothing, and the run says so.
    const named = await lint(root, ["papers"]);
    expect(named.code).toBe(1);
    expect(named.err).toMatch(/nothing was linted/);
  });

  it("a file named on the command line that paperlint does not lint is refused by name", async () => {
    const root = project(VENDORED);
    const r = await lint(root, ["papers/a/repro/x.js"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(
      /papers\/a\/repro\/x\.js is not a file paperlint lints/,
    );
    expect(r.err).toMatch(/PIPELINE-STATUS\.md/);
  });

  it("a paper file named on the command line is still linted", async () => {
    const root = project(VENDORED);
    const r = await lint(root, ["papers/a/paper.tex"]);
    expect(linted(r.out)).toEqual([join(root, "papers/a/paper.tex")]);
  });
});

describe("`rules` blocks reach only the files each rule is written for", () => {
  it.each(["paper/source", "paper/section-word", "review/frontmatter"])(
    "🔴 %s over papers/** runs, instead of crashing inside ESLint",
    async (id) => {
      const root = project({
        "paperlint.json": JSON.stringify({
          rules: [{ files: ["papers/**"], rules: { [id]: "warn" } }],
        }),
      });
      const r = await lint(root);
      expect(r.err).not.toMatch(/Could not find/);
      expect(r.code).toBe(0);
    },
  );

  it("the same, from a paper's own paperlint.json", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        rules: { "paper/source": "warn", "paper/section-word": "off" },
      }),
    });
    const r = await lint(root);
    expect(r.err).not.toMatch(/Could not find/);
    expect(r.code).toBe(0);
  });
});

describe("`rules` blocks — where the rule lands", () => {
  it("on its own files and on no other", async () => {
    const root = project();
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: buildConfig(
        {
          rules: [
            {
              basePath: root,
              files: ["papers/**"],
              rules: { "paper/source": "warn", "paper/section-word": "off" },
            },
          ],
        },
        null,
      ) as Linter.Config[],
    });
    const on = async (file: string) =>
      (
        (await eslint.calculateConfigForFile(join(root, file))) as {
          rules: Record<string, unknown>;
        }
      ).rules;
    const status = await on("papers/a/PIPELINE-STATUS.md");
    expect(status["paper/source"]).toEqual([1]);
    expect(status["paper/section-word"]).toBeUndefined();
    const draft = await on("papers/a/paper.md");
    expect(draft["paper/section-word"]).toEqual([0]);
    expect(draft["paper/source"]).toBeUndefined();
  });
});

describe("paper-files — the pieces", () => {
  const own = [
    { plugins: { g: { rules: { any: {} } } } },
    { files: ["**/a.md"], plugins: { p: { rules: { one: {} } } } },
    { files: ["**/b.md", "**/c.md"], plugins: { p: { rules: { two: {} } } } },
    { files: ["**/c.md"], plugins: { p: { rules: { two: {} } } } },
  ];

  it("owned patterns are every own block's files, once", () => {
    expect(ownedPatterns(own)).toEqual(["**/a.md", "**/b.md", "**/c.md"]);
  });

  it("a rule's owner is where its plugin is registered; a global plugin owns every file", () => {
    const owners = ruleOwners(own);
    expect(owners.get("g/any")).toBeNull();
    expect(owners.get("p/one")).toEqual(["**/a.md"]);
    expect(owners.get("p/two")).toEqual(["**/b.md", "**/c.md"]);
  });
});

describe("paper-files — narrowing a block", () => {
  const own = [
    { plugins: { g: { rules: { any: {} } } } },
    { files: ["**/a.md"], plugins: { p: { rules: { one: {} } } } },
    { files: ["**/b.md", "**/c.md"], plugins: { p: { rules: { two: {} } } } },
  ];

  it("a block is split per owner, its files ANDed with the owner's", () => {
    const blocks = narrowToOwners(
      {
        basePath: "/x",
        files: ["papers/**"],
        ignores: ["papers/old/**"],
        rules: { "p/one": "warn", "p/two": "error", "g/any": "off" },
      },
      ruleOwners(own),
    );
    expect(blocks).toEqual([
      {
        basePath: "/x",
        files: [["papers/**", "**/a.md"]],
        ignores: ["papers/old/**"],
        rules: { "p/one": "warn" },
      },
      {
        basePath: "/x",
        files: [
          ["papers/**", "**/b.md"],
          ["papers/**", "**/c.md"],
        ],
        ignores: ["papers/old/**"],
        rules: { "p/two": "error" },
      },
      {
        basePath: "/x",
        files: ["papers/**"],
        ignores: ["papers/old/**"],
        rules: { "g/any": "off" },
      },
    ]);
  });

  it("without `files`, the owner's patterns are the block's files", () => {
    expect(
      narrowToOwners(
        { basePath: "/x", rules: { "p/one": "warn" } },
        ruleOwners(own),
      ),
    ).toEqual([
      { basePath: "/x", files: ["**/a.md"], rules: { "p/one": "warn" } },
    ]);
  });

  it("a rule registered nowhere in this config reaches nothing — no block, no crash", () => {
    expect(
      narrowToOwners(
        { basePath: "/x", rules: { "tex/x": "warn" } },
        ruleOwners(own),
      ),
    ).toEqual([]);
  });
});

describe("paper-files — the scope", () => {
  it("ignores everything, then un-ignores directories and owned files, then re-ignores ESLint's defaults", () => {
    expect(scopeToOwned(["**/a.md"]).ignores).toEqual([
      "**/*",
      "!**/*/",
      "!**/a.md",
      "**/node_modules/",
      "**/.git/",
    ]);
  });
});
