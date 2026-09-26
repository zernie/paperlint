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

describe("settings: reviewSchema is read at the boundary", () => {
  it("a schema file that does not exist stops the run, naming it", async () => {
    const r = await lint(project({ reviewSchema: "schemas/nope.json" }));
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/reviewSchema: schemas\/nope\.json cannot be read/);
  });

  it("a file that is not a usable JSON Schema stops the run", async () => {
    const r = await lint(
      project(
        { reviewSchema: "schema.json" },
        { "schema.json": '{ "type": "no-such-type" }' },
      ),
    );
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/is not a valid JSON Schema/);
  });

  it("a valid one is applied to the reviews", async () => {
    const r = await lint(
      project(
        { reviewSchema: "schema.json" },
        {
          "schema.json": '{ "required": ["read"] }',
          "papers/a/reviews/r1.md": "# Review\n",
        },
      ),
    );
    expect(ruleIds(r.out)).toContain("review/frontmatter");
  });
});

describe("settings: what 3.0.0 removed is an ordinary unknown key or rule", () => {
  it.each(["typographyDebt", "authorListCommand", "docFields", "causeMarker"])(
    "%s → the generic unknown-key error",
    async (key) => {
      const r = await lint(project({ [key]: 1 }));
      expect(r.code).toBe(2);
      expect(r.err).toMatch(new RegExp(`unknown key "${key}"`));
    },
  );

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
