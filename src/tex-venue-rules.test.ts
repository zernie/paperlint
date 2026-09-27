/**
 * The venue-conformance rules over `paper.tex` (`src/tex-venue-rules.ts`), on a paper held in
 * memory beside the SHIPPED presets, so a preset edit that breaks a check shows here. Each rule has
 * both halves: the finding a planted defect produces, and the silence of a conforming source.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { TEX_VENUE_RULE_LEVELS, texVenueRules } from "./tex-venue-rules.ts";
import { buildConfig, SHIPPED_RULES } from "./cli.ts";

const VENUES = packageVenuesDir();
const PAPER = "/work/papers/p";
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);

interface Finding {
  readonly rule: string;
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/** The line and 1-based column of an offset, as ESLint's text source code gives them. */
const locOf = (src: string) => (i: number) => {
  const before = src.slice(0, i).split("\n");
  return { line: before.length, column: (before.at(-1) ?? "").length + 1 };
};

/**
 * Every venue-conformance rule over one `paper.tex`, the way ESLint runs them: `create`, then
 * `root`. `settings` is the paper's paperlint.json (absent: no file); `extra` more files.
 */
function lint(
  tex: string,
  settings: object | undefined,
  {
    filename = `${PAPER}/paper.tex`,
    extra = {},
    raw = true,
  }: {
    filename?: string;
    extra?: Record<string, string>;
    /** false: the source code carries no `raw` (not the `.tex` language's), only `text`. */
    raw?: boolean;
  } = {},
): Finding[] {
  const files = memoryFiles({
    ...shipped,
    ...(settings === undefined
      ? {}
      : { [`${PAPER}/paperlint.json`]: JSON.stringify(settings) }),
    ...extra,
  });
  const out: Finding[] = [];
  for (const [name, rule] of Object.entries(
    texVenueRules({ files, venuesDir: VENUES }),
  )) {
    const visitor = rule.create({
      filename,
      sourceCode: {
        text: tex,
        ...(raw ? { raw: tex } : {}),
        getLocFromIndex: locOf(tex),
      },
      report: (d) =>
        out.push({
          rule: `tex/${name}`,
          messageId: d.messageId,
          message: Object.entries(d.data ?? {}).reduce(
            (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
            rule.meta.messages[d.messageId] ?? `(no message ${d.messageId})`,
          ),
          line: d.loc.start.line,
        }),
    });
    visitor.root?.();
  }
  return out;
}

const ids = (fs: readonly Finding[]) =>
  fs.map((f) => `${f.rule}:${f.messageId}`).sort();

const AIDC = { extends: "paperlint:aidc", kind: "regular" };
const paper = (documentclass: string, body = "Text.") =>
  `% a comment\n${documentclass}\n\\begin{document}\n${body}\n\\end{document}\n`;
const OFFICIAL = paper("\\documentclass[conference,compsoc]{IEEEtran}");

describe("tex/template — the class and every option the preset names", () => {
  it("the official AIDC template passes", () => {
    expect(lint(OFFICIAL, AIDC)).toEqual([]);
  });

  it("options in another order, with spaces and extra options of the paper's own, pass", () => {
    expect(
      lint(
        paper("\\documentclass[ compsoc,\n  conference , a4paper]{IEEEtran}"),
        AIDC,
      ),
    ).toEqual([]);
  });

  it.each<[string, string, string[], RegExp]>([
    [
      "[conference]{IEEEtran} — compsoc missing",
      "\\documentclass[conference]{IEEEtran}",
      ["tex/template:missingOption"],
      /the class option `compsoc` is missing: aidc requires `\\documentclass\[conference,compsoc\]\{IEEEtran\}`/,
    ],
    [
      "{acmart} under an IEEE preset",
      "\\documentclass[sigconf]{acmart}",
      ["tex/template:wrongClass"],
      /the class is `acmart`, and aidc requires/,
    ],
    [
      "[journal,compsoc]{IEEEtran} — conference missing",
      "\\documentclass[journal,compsoc]{IEEEtran}",
      ["tex/template:missingOption"],
      /`conference` is missing/,
    ],
    [
      "{IEEEtran} with no options — both missing, one finding each",
      "\\documentclass{IEEEtran}",
      ["tex/template:missingOption", "tex/template:missingOption"],
      /`conference` is missing/,
    ],
  ])("%s", (_, cls, want, message) => {
    const fs = lint(paper(cls), AIDC);
    expect(ids(fs)).toEqual(want);
    expect(fs[0]?.message).toMatch(message);
    // At the \documentclass line, where the fix is.
    expect(fs[0]?.line).toBe(2);
  });

  it("a paper with no \\documentclass at all says so, at the top", () => {
    const fs = lint("\\begin{document}x\\end{document}\n", AIDC);
    expect(ids(fs)).toEqual(["tex/template:noClass"]);
    expect(fs[0]?.line).toBe(1);
  });

  it("a \\documentclass inside a comment is not the paper's class", () => {
    const fs = lint(
      "% \\documentclass[conference,compsoc]{IEEEtran}\n\\documentclass{article}\n",
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:wrongClass"]);
  });
});

describe("tex/template — the shipped ACM and ACL templates", () => {
  it("🔴 acmart without sigconf — the manuscript format — fails every ACM preset", () => {
    for (const settings of [
      { extends: "paperlint:aisec", kind: "research" },
      { extends: "paperlint:agenticdev", kind: "short" },
      { extends: "paperlint:acm-sigconf" },
    ])
      expect(ids(lint(paper("\\documentclass{acmart}"), settings))).toEqual([
        "tex/template:missingOption",
      ]);
    expect(
      lint(paper("\\documentclass[sigconf,review,anonymous]{acmart}"), {
        extends: "paperlint:aisec",
        kind: "research",
      }),
    ).toEqual([]);
  });

  it("an ACL paper — article at 11pt, acl.sty as a package — passes realm", () => {
    expect(
      lint(paper("\\documentclass[11pt]{article}\n\\usepackage[review]{acl}"), {
        extends: "paperlint:realm",
        kind: "long",
      }),
    ).toEqual([]);
  });
});

describe("tex/template — a project's own preset, and nothing to judge", () => {
  it("a preset with no template: nothing to compare, no finding", () => {
    const own = `${PAPER}/own.jsonc`;
    expect(
      lint(
        paper("\\documentclass{whatever}"),
        { extends: "./own.jsonc" },
        {
          extra: { [own]: JSON.stringify({ tex: { packages: { x: ["x"] } } }) },
        },
      ),
    ).toEqual([]);
  });

  it("a bare class name as the template names the class and no option", () => {
    const own = `${PAPER}/own.jsonc`;
    const extra = {
      [own]: JSON.stringify({
        template: "article",
        tex: { packages: { x: ["x"] } },
      }),
    };
    const settings = { extends: "./own.jsonc" };
    expect(
      lint(paper("\\documentclass[twocolumn]{article}"), settings, { extra }),
    ).toEqual([]);
    expect(
      ids(lint(paper("\\documentclass{report}"), settings, { extra })),
    ).toEqual(["tex/template:wrongClass"]);
  });

  it.each<[string, object | undefined, string]>([
    ["no paperlint.json", undefined, `${PAPER}/paper.tex`],
    [
      "a paperlint.json with no extends",
      { extends: null },
      `${PAPER}/paper.tex`,
    ],
    [
      "a preset that does not resolve (pdf/profile says so)",
      { extends: "paperlint:nope" },
      `${PAPER}/paper.tex`,
    ],
    ["a file that is not paper.tex", AIDC, `${PAPER}/draft.tex`],
  ])("silent on %s", (_, settings, filename) => {
    expect(
      lint(paper("\\documentclass{article}"), settings, { filename }),
    ).toEqual([]);
  });

  it("reads `text` when the source code has no `raw`", () => {
    expect(
      ids(lint(paper("\\documentclass{article}"), AIDC, { raw: false })),
    ).toEqual(["tex/template:wrongClass"]);
  });
});

describe("paperlint's own config", () => {
  it("turns tex/template on at error for every paper.tex, and ships it", () => {
    expect(TEX_VENUE_RULE_LEVELS["tex/template"]).toBe("error");
    const tex = buildConfig({}, { sentinel: "tex" }).find((b) =>
      b.files?.includes("**/paper.tex"),
    );
    expect(tex?.rules?.["tex/template"]).toBe("error");
    expect(SHIPPED_RULES.has("tex/template")).toBe(true);
  });
});
