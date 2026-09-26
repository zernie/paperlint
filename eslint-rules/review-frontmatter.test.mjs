/**
 * review/frontmatter — a review's findings are records in its frontmatter, validated by JSON
 * Schema; a project adds its own requirements with a schema of its own (allOf).
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import review, { schemaProblem } from "./review-frontmatter.mjs";

async function lint(text, extend) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: {
          "review/frontmatter": ["error", extend ? { extend } : {}],
        },
      },
    ],
  });
  const [res] = await eslint.lintText(text, { filePath: "reviews/r1.md" });
  expect(res.messages.filter((m) => m.fatal)).toEqual([]);
  return res.messages.map((m) => m.message);
}
const fm = (yaml) => `---\n${yaml}\n---\n# Review\n\nProse.\n`;

describe("review/frontmatter — the findings record", () => {
  it("silent on a valid record: open with a cause, fixed and wontfix without", async () => {
    expect(
      await lint(
        fm(
          "findings:\n  - id: 1\n    status: open\n    cause: missing-skill\n  - id: 2\n    status: fixed\n  - id: 3\n    status: wontfix",
        ),
      ),
    ).toEqual([]);
  });

  it("🔴 an OPEN finding without a cause is a finding — the schema's if/then, not code", async () => {
    const msgs = await lint(fm("findings:\n  - id: 1\n    status: open"));
    expect(msgs).toEqual([
      "`findings[0]` should have required property 'cause'",
    ]);
  });

  it("a cause or status outside the list names the allowed values", async () => {
    const msgs = await lint(
      fm(
        "findings:\n  - id: 1\n    status: done\n  - id: 2\n    status: open\n    cause: typo",
      ),
    );
    expect(msgs).toEqual([
      "`findings[0].status` must be one of: open, fixed, wontfix",
      "`findings[1].cause` must be one of: skill-defect, missing-skill, hook, rule",
    ]);
  });

  it("a misspelt field is named, not silently accepted", async () => {
    expect(
      await lint(
        fm("findings:\n  - id: 1\n    status: fixed\n    casue: hook"),
      ),
    ).toEqual(["`findings[0]` has an unknown field `casue`"]);
  });

  it("a review with no `findings` key is not a findings record — no date needed", async () => {
    expect(await lint(fm("created: 2020-01-01\ntitle: old review"))).toEqual(
      [],
    );
    expect(await lint("# An old review with no frontmatter\n")).toEqual([]);
  });

  it("YAML that does not parse is reported, not crashed on", async () => {
    expect(await lint(fm("findings: [unclosed"))).toEqual([
      expect.stringMatching(/does not parse as YAML/),
    ]);
  });
});

describe("review/frontmatter — the project's own schema, applied together with paperlint's", () => {
  const project = {
    type: "object",
    required: ["read"],
    properties: { read: { enum: ["full", "abstract", "none"] } },
  };

  it("its required field is enforced, and a date stays a string (YAML core schema)", async () => {
    expect(await lint(fm("read: full\ncreated: 2026-09-20"), project)).toEqual(
      [],
    );
    expect(await lint(fm("created: 2026-09-20"), project)).toEqual([
      "the frontmatter should have required property 'read'",
    ]);
    expect(await lint(fm("read: skimmed"), project)).toEqual([
      "`read` must be one of: full, abstract, none",
    ]);
  });

  it("🔴 a missing frontmatter is not a way around it", async () => {
    expect(await lint("# No header at all\n", project)).toEqual([
      "the frontmatter should have required property 'read'",
    ]);
  });

  it("and it cannot lift paperlint's: an open finding still needs its cause", async () => {
    expect(
      await lint(
        fm("read: full\nfindings:\n  - id: 1\n    status: open"),
        project,
      ),
    ).toEqual(["`findings[0]` should have required property 'cause'"]);
  });

  it("schemaProblem: a schema ajv cannot compile is named at the boundary", () => {
    expect(schemaProblem(project)).toBeNull();
    expect(schemaProblem({ type: "no-such-type" })).toMatch(/.+/);
    expect(schemaProblem([])).toMatch(/JSON object/);
  });
});
