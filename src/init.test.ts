/**
 * `paperlint init` over a project that ALREADY declares its papers directory: the declaration is
 * the answer, and init reports it — not a directory it discovered elsewhere and then did not use.
 *
 * Seen migrating a consumer project: init printed "papers directory ✓ eslint-rules/fixtures — 4
 * candidates", then kept the declared papersDir. The line described a decision that was not made.
 */
import {
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
    "package.json": JSON.stringify({
      name: "c",
      private: true,
      paperlint: { papersDir: "papers" },
    }),
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
      text.indexOf("declaration"),
    );
    expect(code).toBe(0);
    expect(section).toMatch(/✓ papers — declared in package\.json/);
    expect(section).not.toMatch(/candidates|eslint-rules|drafts/);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.paperlint.papersDir).toBe("papers");
  });

  it("is not asked about, even with a human at the terminal", async () => {
    const asked: string[] = [];
    const choice = await choosePapers(project(), {
      interactive: true,
      ask: async (q) => (asked.push(q), "2"),
      declared: "papers",
    });
    expect(asked).toEqual([]);
    expect(choice).toEqual({
      papers: "papers",
      how: "declared",
      candidates: [],
    });
  });

  it("without a declaration, the candidates are still measured and offered", async () => {
    const choice = await choosePapers(project(), {
      interactive: false,
      declared: null,
    });
    expect(choice.how).toBe("not-asked");
    expect(choice.candidates.length).toBeGreaterThan(1);
  });
});
