/**
 * `paperlint.json` through the commands, on a real directory: `paperlint lint` applies a paper's
 * `rules` to that paper alone and refuses an unknown rule id.
 */
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
import { run, toolchainTex } from "./cli.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A project with two papers, `a` and `b`, each with paper.tex and PIPELINE-STATUS.md. */
function project(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-settings-")));
  dirs.push(root);
  const all: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "c",
      private: true,
      paperlint: { papersDir: "papers" },
    }),
    "papers/a/paper.tex":
      "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "papers/b/paper.tex":
      "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
    "papers/b/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
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
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["lint", "--json"], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const rulesIn = (stdout: string, paper: string): string[] =>
  (JSON.parse(stdout) as { filePath: string; messages: { ruleId: string }[] }[])
    .filter((r) => r.filePath.endsWith(join(paper, "paper.tex")))
    .flatMap((r) => r.messages.map((m) => m.ruleId));

describe("paperlint lint — `rules` in a paper's paperlint.json", () => {
  it("turns an optional rule on for that paper alone", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        rules: { "pdf/last-page-balance": "error" },
      }),
    });
    const r = await lint(root);
    // The rule is on for `a` (no facts file: it says so, loudly) and for `b` it does not exist.
    expect(rulesIn(r.out, "a")).toContain("pdf/last-page-balance");
    expect(rulesIn(r.out, "b")).not.toContain("pdf/last-page-balance");
  });

  it("the project's own `rules` blocks come after, so they win", async () => {
    const root = project({
      "package.json": JSON.stringify({
        name: "c",
        private: true,
        paperlint: {
          papersDir: "papers",
          rules: [
            {
              files: ["papers/a/**"],
              rules: { "pdf/last-page-balance": "off" },
            },
          ],
        },
      }),
      "papers/a/paperlint.json": JSON.stringify({
        rules: { "pdf/last-page-balance": "error" },
      }),
      "papers/b/paperlint.json": JSON.stringify({
        rules: { "pdf/last-page-balance": "error" },
      }),
    });
    const r = await lint(root);
    expect(rulesIn(r.out, "a")).not.toContain("pdf/last-page-balance");
    expect(rulesIn(r.out, "b")).toContain("pdf/last-page-balance");
  });

  it.each([
    [
      "an unknown rule id",
      { rules: { "pdf/no-such-rule": "error" } },
      /not a rule paperlint ships/,
    ],
    ["an unknown key", { venu: "aisec" }, /unknown key "venu"/],
  ])("refuses %s before linting, naming the file", async (_, settings, why) => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify(settings),
    });
    const r = await lint(root);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(why);
    expect(r.err).toMatch(/papers\/a\/paperlint\.json/);
  });
});

describe("paperlint lint — the venue preset's rules", () => {
  it("agenticdev's preset turns pdf/last-page-balance on for its paper alone", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        extends: "paperlint:agenticdev",
        kind: "short",
      }),
    });
    const cfgOf = await import("./cli.ts").then((m) =>
      m.paperRuleBlocks([join(root, "papers")]),
    );
    expect(cfgOf.ok && cfgOf.value).toEqual([
      {
        basePath: join(root, "papers/a"),
        files: expect.arrayContaining([
          "**/paper.tex",
          "**/PIPELINE-STATUS.md",
        ]),
        rules: { "pdf/last-page-balance": ["error", { tolerancePt: 120 }] },
      },
    ]);
  });

  it("🔴 an unbuilt agenticdev paper: ONE warning (pdf/measured), and no balance error", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        extends: "paperlint:agenticdev",
        kind: "short",
      }),
    });
    const r = await lint(root);
    expect(r.code).toBe(0);
    expect(rulesIn(r.out, "a")).toEqual(["pdf/measured"]);
  });
});

describe("paperlint lint — the paper over its preset, and the project's own presets", () => {
  it("the paper's own rules win over its preset's", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        extends: "paperlint:agenticdev",
        rules: { "pdf/last-page-balance": "off" },
      }),
    });
    const blocks = await import("./cli.ts").then((m) =>
      m.paperRuleBlocks([join(root, "papers")]),
    );
    expect(blocks.ok && blocks.value[0]?.rules).toEqual({
      "pdf/last-page-balance": "off",
    });
  });

  it("a project's own preset, by relative path: its rules apply, an unknown rule id is refused", async () => {
    const root = project({
      "venues/usenix-sec.jsonc": JSON.stringify({
        extends: "paperlint:acm-sigconf",
        rules: { "pdf/no-such-rule": "error" },
      }),
      "papers/a/paperlint.json": JSON.stringify({
        extends: "../../venues/usenix-sec.jsonc",
      }),
    });
    const r = await lint(root);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usenix-sec\.jsonc.*not a rule paperlint ships/);
  });

  it("a typo in extends is a pdf/profile error listing the shipped presets", async () => {
    const root = project({
      "papers/a/paperlint.json": JSON.stringify({
        extends: "paperlint:agenticdve",
      }),
    });
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/acm-sigconf, agenticdev, aisec, realm/);
  });
});

describe("paperlint toolchain — installs what the project's own presets need", () => {
  it("the shipped union plus a relative preset's tex packages", () => {
    const root = project({
      "venues/usenix-sec.jsonc": JSON.stringify({
        extends: "paperlint:acm-sigconf",
        tex: { packages: { usenix: ["usenix.sty"] } },
      }),
      "papers/a/paperlint.json": JSON.stringify({
        extends: "../../venues/usenix-sec.jsonc",
      }),
    });
    const tex = toolchainTex(root);
    expect(tex.packages["usenix"]).toEqual(["usenix.sty"]);
    expect("acmart" in tex.packages).toBe(true);
    expect("hyperref" in tex.packages).toBe(true);
  });

  it("without papers of its own: the shipped union alone", () => {
    const tex = toolchainTex(project());
    expect("usenix" in tex.packages).toBe(false);
    expect("acmart" in tex.packages).toBe(true);
  });
});
