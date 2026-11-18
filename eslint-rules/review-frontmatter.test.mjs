/**
 * review/frontmatter — a review's findings are records in its frontmatter, validated by JSON
 * Schema — and sibling cards, the same mechanism with the package's sibling-card schema.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import review, { errorsOf } from "./review-frontmatter.ts";
import { parseFrontmatter } from "./frontmatter-record.ts";
import sibling from "./sibling-frontmatter.ts";

async function lint(text, rule = "review/frontmatter") {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: {
          [rule]: "error",
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

describe("review/frontmatter — what the parser and the validator may hand back", () => {
  /** The rule's visitors over a fake context; the reports it makes. */
  const visit = (value) => {
    const reports = [];
    const v = review.rules.frontmatter.create({
      report: (r) => reports.push(r),
    });
    v.yaml({ value });
    v["root:exit"]({});
    return reports.map(
      (r) => r.messageId + (r.data?.why ? `: ${r.data.why}` : ""),
    );
  };

  it("an empty frontmatter block is validated as `{}` — silent", async () => {
    expect(await lint("---\n---\n# Review\n")).toEqual([]);
    expect(visit(undefined)).toEqual([]);
  });

  it("a parser failure without a YAML reason is reported by its message, or as unparseable", () => {
    const throwing = (thrown) => ({
      toString() {
        throw thrown;
      },
    });
    expect(visit(throwing(new Error("boom")))).toEqual(["malformed: boom"]);
    expect(visit(throwing("not an Error"))).toEqual(["malformed: unparseable"]);
  });

  it("a failed validation with no errors attached names nothing", () => {
    const validate = () => false;
    validate.errors = null;
    expect(errorsOf(validate, {})).toEqual([]);
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

describe("review/frontmatter — the optional `where` and `found_by` fields", () => {
  it("silent when a finding names where it was found and by what", async () => {
    expect(
      await lint(
        fm(
          "findings:\n  - id: 1\n    status: fixed\n    where: paper.tex:83\n    found_by: tex/register",
        ),
      ),
    ).toEqual([]);
  });

  it("silent on an old record that has neither — every existing review stays valid", async () => {
    expect(await lint(fm("findings:\n  - id: 1\n    status: fixed"))).toEqual(
      [],
    );
  });

  it("a `where` or `found_by` that is not a string is reported", async () => {
    expect(
      await lint(
        fm(
          "findings:\n  - id: 1\n    status: fixed\n    where: 83\n    found_by: [a]",
        ),
      ),
    ).toEqual([
      "`findings[0].where` should be string",
      "`findings[0].found_by` should be string",
    ]);
  });
});

describe("review/findings-closed — an open finding is a finding", () => {
  const closed = (text) => lint(text, "review/findings-closed");

  it("🔴 reports each open finding once, naming its id, title and where", async () => {
    expect(
      await closed(
        fm(
          [
            "findings:",
            "  - id: 1",
            "    status: open",
            "    cause: rule",
            "    title: Abstract overclaims",
            "    where: paper.tex:83",
            "  - id: 2",
            "    status: fixed",
            "  - id: x7",
            "    status: open",
            "    cause: hook",
            "    title: Table 2 is unreferenced",
            "  - id: 4",
            "    status: open",
            "    cause: rule",
          ].join("\n"),
        ),
      ),
    ).toEqual([
      "finding 1 is still open: Abstract overclaims (paper.tex:83)",
      "finding x7 is still open: Table 2 is unreferenced",
      "finding 4 is still open",
    ]);
  });

  it("quiet when every finding is fixed or wontfix", async () => {
    expect(
      await closed(
        fm(
          "findings:\n  - id: 1\n    status: fixed\n    title: a\n  - id: 2\n    status: wontfix\n    note: by design",
        ),
      ),
    ).toEqual([]);
  });

  it("quiet on a review with no findings, no frontmatter, an empty list or unparseable YAML", async () => {
    expect(await closed(fm("title: old review"))).toEqual([]);
    expect(await closed("# no header\n")).toEqual([]);
    expect(await closed(fm("findings: []"))).toEqual([]);
    expect(await closed(fm("findings: [unclosed"))).toEqual([]);
    expect(await closed("---\n---\n# Review\n")).toEqual([]);
  });

  it("reads what it can of a malformed record: an entry that is no mapping, or has no status, is skipped", async () => {
    expect(
      await closed(
        fm(
          "findings:\n  - just a string\n  - id: 1\n  - id: 2\n    status: open\n    title: 7",
        ),
      ),
    ).toEqual(["finding 2 is still open"]);
    expect(await closed(fm("findings: nope"))).toEqual([]);
  });

  it("is not part of what review/frontmatter checks: an open finding with a cause passes there", async () => {
    expect(
      await lint(fm("findings:\n  - id: 1\n    status: open\n    cause: rule")),
    ).toEqual([]);
  });
});

describe("parseFrontmatter — the one reading both rules share", () => {
  it("returns the record, `{}` for an empty block, and the reason when it does not parse", () => {
    expect(parseFrontmatter("findings:\n  - id: 1")).toEqual({
      ok: true,
      data: { findings: [{ id: 1 }] },
    });
    expect(parseFrontmatter(undefined)).toEqual({ ok: true, data: {} });
    expect(parseFrontmatter("findings: [unclosed")).toEqual({
      ok: false,
      why: expect.stringMatching(/./),
    });
  });
});
