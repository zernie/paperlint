/**
 * `paperlint init` over a project that ALREADY declares its papers directory: the declaration is
 * the answer, and init reports it — not a directory it discovered elsewhere and then did not use.
 *
 * Seen migrating a consumer project: init printed "papers directory ✓ eslint-rules/fixtures — 4
 * candidates", then kept the declared papersDir. The line described a decision that was not made.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { choosePapers, init } from "./init.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Declares `papersDir: "papers"`, and holds two OTHER directories that look like papers roots. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-init-")));
  dirs.push(root);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "c", private: true }),
    "paperlint.json": JSON.stringify({ papersDir: "papers" }),
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "eslint-rules/fixtures/x/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "eslint-rules/fixtures/y/paper.md": "# y\n",
    "drafts/z/paper.md": "# z\n",
  };
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

describe("paperlint init — a declared papers directory", () => {
  it("🔴 is the one reported, and no discovered candidate is named", async () => {
    const root = project();
    const out: string[] = [];
    const code = await init(root, {
      cwd: root,
      log: (s: string) => out.push(s),
      err: (s: string) => out.push(s),
      interactive: false,
      hooks: false,
      run: (() => ({ status: 0 })) as never,
      link: () => ({ ok: false, error: "not linked in this test" }),
    });
    const text = out.join("\n");
    const section = text.slice(
      text.indexOf("papers directory"),
      text.indexOf("settings"),
    );
    expect(code).toBe(0);
    expect(section).toMatch(/✓ papers — declared in paperlint\.json/);
    expect(section).not.toMatch(/candidates|eslint-rules|drafts/);
    const cfg = JSON.parse(readFileSync(join(root, "paperlint.json"), "utf8"));
    expect(cfg).toEqual({ papersDir: "papers" });
  });

  it("is not asked about, even with a human at the terminal", async () => {
    const root = project();
    const asked: string[] = [];
    await init(root, {
      cwd: root,
      log: () => {},
      err: () => {},
      interactive: true,
      ask: async (q) => (asked.push(q), "n"),
      hooks: false,
      run: (() => ({ status: 0 })) as never,
      link: () => ({ ok: false, error: "not linked in this test" }),
    });
    expect(asked.filter((q) => /papers roots/.test(q))).toEqual([]);
  });

  it("without a declaration, the candidates are still measured and offered", async () => {
    const choice = await choosePapers(project(), { interactive: false });
    expect(choice.how).toBe("not-asked");
    expect(choice.candidates.length).toBeGreaterThan(1);
  });
});

describe("paperlint init — writes paperlint.json only when something differs from the default", () => {
  const quiet = {
    log: () => {},
    err: () => {},
    interactive: false,
    hooks: false,
    run: (() => ({ status: 0 })) as never,
    link: () => ({ ok: false as const, error: "not linked in this test" }),
  };
  const fresh = (files: Record<string, string>): string => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-init-")));
    dirs.push(root);
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(join(root, p, ".."), { recursive: true });
      writeFileSync(join(root, p), text);
    }
    return root;
  };

  it("🔴 papers/ is where the papers are: no paperlint.json is written", async () => {
    const root = fresh({ "papers/a/paper.tex": "x" });
    await init(root, { cwd: root, ...quiet });
    expect(existsSync(join(root, "paperlint.json"))).toBe(false);
  });

  it("nothing looks like papers: the default, and still no file", async () => {
    const root = fresh({ "README.md": "x" });
    await init(root, { cwd: root, ...quiet });
    expect(existsSync(join(root, "paperlint.json"))).toBe(false);
  });

  it("papers elsewhere: { papersDir } is written, and other keys already there are kept", async () => {
    const root = fresh({
      "docs/drafts/a/paper.tex": "x",
      "paperlint.json": '{ "kind": "short" }\n',
    });
    await init(root, { cwd: root, ...quiet });
    expect(
      JSON.parse(readFileSync(join(root, "paperlint.json"), "utf8")),
    ).toEqual({ kind: "short", papersDir: "docs/drafts" });
  });
});
