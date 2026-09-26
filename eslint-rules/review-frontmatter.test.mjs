/**
 * review/frontmatter — a review's findings are records in its frontmatter, validated by JSON
 * Schema — and sibling cards, the same mechanism with the package's sibling-card schema.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import review from "./review-frontmatter.mjs";
import sibling from "./sibling-frontmatter.mjs";

async function lint(text) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: {
          "review/frontmatter": "error",
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

describe("sibling/frontmatter — the same mechanism, the package's own sibling-card schema", () => {
  async function card(text) {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.md"],
          plugins: { markdown, sibling },
          language: "markdown/gfm",
          languageOptions: { frontmatter: "yaml" },
          rules: { "sibling/frontmatter": "warn" },
        },
      ],
    });
    const [res] = await eslint.lintText(text, { filePath: "siblings/x.md" });
    return res.messages.map((m) => m.message);
  }
  it("read: full | abstract | none — silent", async () => {
    for (const v of ["full", "abstract", "none"])
      expect(await card(fm(`read: ${v}`))).toEqual([]);
  });
  it("🔴 a card without the field — or without any frontmatter — is a finding", async () => {
    expect(await card(fm("title: x"))).toEqual([
      "the frontmatter should have required property 'read'",
    ]);
    expect(await card("# no header\n")).toEqual([
      "the frontmatter should have required property 'read'",
    ]);
  });
  it("a value outside the three names them", async () => {
    expect(await card(fm("read: skimmed"))).toEqual([
      "`read` must be one of: full, abstract, none",
    ]);
  });
});
