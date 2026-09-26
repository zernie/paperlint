/**
 * `paperlint lint --fix`, and the settings that replaced the ratchets, through the command.
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
import { run } from "./cli.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(
  settings: Record<string, unknown>,
  files: Record<string, string> = {},
): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-fix-")));
  dirs.push(root);
  const all: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "c",
      private: true,
      paperlint: { papersDir: "papers", ...settings },
    }),
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "papers/a/paper.md": "# Intro\n\nSee §5, §6 and §7; p < .05.\n",
    ...files,
  };
  for (const [p, text] of Object.entries(all)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

async function lint(root: string, args: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["lint", "--json", ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
const ruleIds = (stdout: string): string[] =>
  (JSON.parse(stdout) as { messages: { ruleId: string }[] }[]).flatMap((r) =>
    r.messages.map((m) => m.ruleId),
  );

describe("paperlint lint --fix", () => {
  it("🔴 three `§` and a bare decimal → --fix → zero findings, and the file says Section", async () => {
    const root = project({});
    const before = ruleIds((await lint(root)).out);
    expect(before.filter((r) => r === "paper/section-word")).toHaveLength(3);
    expect(before).toContain("paper/leading-zero");
    const fixed = await lint(root, ["--fix"]);
    expect(ruleIds(fixed.out)).not.toContain("paper/section-word");
    expect(ruleIds(fixed.out)).not.toContain("paper/leading-zero");
    expect(readFileSync(join(root, "papers/a/paper.md"), "utf8")).toBe(
      "# Intro\n\nSee Section 5, Section 6 and Section 7; p < 0.05.\n",
    );
  });

  it("without --fix nothing is written", async () => {
    const root = project({});
    await lint(root);
    expect(readFileSync(join(root, "papers/a/paper.md"), "utf8")).toMatch(/§5/);
  });
});

describe("sibling cards: `read:` is required, from the package's own schema", () => {
  it("a card without it is a warning; with it, silent; the index is not a card", async () => {
    const root = project(
      {},
      {
        "papers/a/siblings/README.md": "# Siblings\n",
        "papers/a/siblings/smith2025.md": "# Smith 2025\n",
        "papers/a/siblings/jones2024.md": "---\nread: abstract\n---\n# Jones\n",
      },
    );
    const results = JSON.parse((await lint(root)).out) as {
      filePath: string;
      messages: { ruleId: string; severity: number }[];
    }[];
    const of = (name: string) =>
      results.find((r) => r.filePath.endsWith(name))?.messages ?? null;
    expect(of("smith2025.md")?.map((m) => [m.ruleId, m.severity])).toEqual([
      ["sibling/frontmatter", 1],
    ]);
    expect(of("jones2024.md")).toEqual([]);
    expect(of("siblings/README.md")).toBeNull();
  });
});

describe("settings: what 3.0.0 removed is an ordinary unknown key or rule", () => {
  it.each([
    "typographyDebt",
    "authorListCommand",
    "docFields",
    "causeMarker",
    "reviewSchema",
  ])("%s → the generic unknown-key error", async (key) => {
    const r = await lint(project({ [key]: 1 }));
    expect(r.code).toBe(2);
    expect(r.err).toMatch(new RegExp(`unknown key "${key}"`));
  });

  it("paper/typography → not a rule paperlint ships", async () => {
    const r = await lint(
      project({
        rules: [{ files: ["papers/**"], rules: { "paper/typography": "off" } }],
      }),
    );
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/"paper\/typography" is not a rule paperlint ships/);
  });
});
