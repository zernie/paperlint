/**
 * `paperlint.json` through the commands, on a real directory: `paperlint lint` applies a paper's
 * `rules` to that paper alone and refuses an unknown rule id; `paperlint init` moves a pre-2.1.0
 * `venue.json` and refuses when both files exist and differ; `paperlint doctor` names a leftover.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.ts";
import { migratePaperSettings } from "./init.ts";
import { doctor } from "./doctor.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A project with two papers, `a` and `b`, each with paper.tex and PIPELINE-STATUS.md. */
function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "paperlint-settings-"));
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

describe("paperlint init — moves venue.json to paperlint.json", () => {
  const legacy = '{ "venue": "aisec", "kind": "research" }\n';

  it("renames it, byte for byte, and says so", () => {
    const root = project({ "papers/a/venue.json": legacy });
    const r = migratePaperSettings(join(root, "papers"));
    expect(r.code).toBe(0);
    expect(existsSync(join(root, "papers/a/venue.json"))).toBe(false);
    expect(readFileSync(join(root, "papers/a/paperlint.json"), "utf8")).toBe(
      legacy,
    );
    expect(r.lines.join("\n")).toMatch(/a\/venue\.json → a\/paperlint\.json/);
  });

  it("both, with the same content: the leftover is removed", () => {
    const root = project({
      "papers/a/venue.json": legacy,
      "papers/a/paperlint.json": '{"venue":"aisec","kind":"research"}',
    });
    expect(migratePaperSettings(join(root, "papers")).code).toBe(0);
    expect(existsSync(join(root, "papers/a/venue.json"))).toBe(false);
  });

  it("🔴 both, and they differ: refused, naming both, and nothing is touched", () => {
    const root = project({
      "papers/a/venue.json": legacy,
      "papers/a/paperlint.json": '{"venue":"realm"}',
    });
    const r = migratePaperSettings(join(root, "papers"));
    expect(r.code).toBe(2);
    expect(r.lines.join("\n")).toMatch(/a\/venue\.json.*a\/paperlint\.json/);
    expect(readFileSync(join(root, "papers/a/venue.json"), "utf8")).toBe(
      legacy,
    );
    expect(readFileSync(join(root, "papers/a/paperlint.json"), "utf8")).toBe(
      '{"venue":"realm"}',
    );
  });

  it("no venue.json anywhere: nothing to say", () => {
    const root = project();
    expect(migratePaperSettings(join(root, "papers"))).toEqual({
      code: 0,
      lines: [],
    });
  });
});

describe("paperlint doctor — names a leftover venue.json", () => {
  it("✗ with the command that moves it, and a failing exit", () => {
    const root = project({ "papers/a/venue.json": '{"venue":"aisec"}' });
    const out: string[] = [];
    const code = doctor({
      log: (s: string) => out.push(s),
      cwd: root,
      projectDir: root,
      cliPapers: "papers",
      run: (() => ({ status: 0, stdout: "", stderr: "" })) as never,
      skillLinks: () => ({ ok: false, error: "not checked in this test" }),
    });
    const text = out.join("\n");
    expect(text).toMatch(/✗ papers\/a\/venue\.json is no longer read/);
    expect(text).toMatch(/npx paperlint init/);
    expect(code).not.toBe(0);
  });

  it("says nothing about it when there is none", () => {
    const root = project();
    const out: string[] = [];
    doctor({
      log: (s: string) => out.push(s),
      cwd: root,
      projectDir: root,
      cliPapers: "papers",
      run: (() => ({ status: 0, stdout: "", stderr: "" })) as never,
      skillLinks: () => ({ ok: false, error: "not checked in this test" }),
    });
    expect(out.join("\n")).not.toMatch(/venue\.json/);
  });
});
