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
/** A paper in `documentclass`; the default body carries AIDC's required closing section. */
const paper = (
  documentclass: string,
  body = "Text.\n\\section*{LLM Usage Statement}\nNone.",
) =>
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
    const fs = lint(
      "\\begin{document}x\\section*{LLM Usage Statement}\\end{document}\n",
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:noClass"]);
    expect(fs[0]?.line).toBe(1);
  });

  it("a \\documentclass inside a comment is not the paper's class", () => {
    const fs = lint(
      "% \\documentclass[conference,compsoc]{IEEEtran}\n\\documentclass{article}\n\\section*{LLM Usage Statement}\n",
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

/** An AIDC paper: the official class, `sections` in order, then `tail` after them. */
const aidcPaper = (body: string): string =>
  paper("\\documentclass[conference,compsoc]{IEEEtran}", body);
const BODY = "\\section{Introduction}\nText.\n\\section{Conclusion}\nText.\n";
const STATEMENT = "\\section*{LLM Usage Statement}\nNo LLMs were used.\n";
const BIB = "\\bibliographystyle{IEEEtran}\n\\bibliography{refs}\n";
const APPENDIX = "\\appendix\n\\section{Proofs}\nText.\n";
const required = (fs: readonly Finding[]) =>
  fs.filter((f) => f.rule === "tex/required-section");

describe("tex/required-section — ACSAC's «LLM Usage Statement» under aidc", () => {
  it.each<[string, string]>([
    [
      "after the last body section, before the bibliography",
      BODY + STATEMENT + BIB,
    ],
    [
      "after the bibliography — «at the end of the paper»",
      BODY + BIB + STATEMENT,
    ],
    ["between the body and an appendix", BODY + STATEMENT + APPENDIX + BIB],
    [
      "after the appendix and the bibliography",
      BODY + APPENDIX + BIB + STATEMENT,
    ],
    [
      "unstarred, with its title broken over two lines",
      BODY + "\\section{LLM   Usage\n  Statement}\nx\n" + BIB,
    ],
    [
      "inside a thebibliography paper, after it",
      BODY +
        "\\begin{thebibliography}{1}\\bibitem{a} A.\\end{thebibliography}\n" +
        STATEMENT,
    ],
  ])("passes %s", (_, body) => {
    expect(lint(aidcPaper(body), AIDC)).toEqual([]);
  });
});

describe("tex/required-section — what fails", () => {
  it("🔴 the planted «Use of Generative AI» bold paragraph fails: not a section, not that title", () => {
    const tex = aidcPaper(
      BODY + BIB + "\\paragraph{Use of Generative AI.} We used an LLM.\n",
    );
    const fs = required(lint(tex, AIDC));
    expect(ids(fs)).toEqual(["tex/required-section:missing"]);
    expect(fs[0]?.message).toBe(
      "aidc requires a section titled «LLM Usage Statement» and there is none — add `\\section*{LLM Usage Statement}` (the title exactly; a bold paragraph does not count)",
    );
    // At `\end{document}`, where the section would go.
    expect(fs[0]?.line).toBe(tex.split("\n").indexOf("\\end{document}") + 1);
  });

  it("a near title is not the title: the venue's words are the contract", () => {
    expect(
      ids(
        required(
          lint(aidcPaper(BODY + "\\section*{LLM usage statement}\nx\n"), AIDC),
        ),
      ),
    ).toEqual(["tex/required-section:missing"]);
  });

  it("🔴 the same section before the introduction fails, naming a body section after it", () => {
    const tex = aidcPaper(STATEMENT + BODY + BIB);
    const fs = required(lint(tex, AIDC));
    expect(ids(fs)).toEqual(["tex/required-section:notLast"]);
    expect(fs[0]?.message).toMatch(/«Introduction» comes after it/);
    expect(fs[0]?.line).toBe(
      tex.split("\n").indexOf("\\section*{LLM Usage Statement}") + 1,
    );
  });
});

describe("tex/required-section — the edges", () => {
  it("an unmarked section after the bibliography is back matter, not body", () => {
    // A statement, then the bibliography, then an unmarked section: that section is back matter.
    expect(
      lint(
        aidcPaper(BODY + STATEMENT + BIB + "\\section{Artifact}\nx\n"),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("a fragment with no document environment: the missing section points at the top", () => {
    const fs = required(
      lint(
        "\\documentclass[conference,compsoc]{IEEEtran}\n\\section{A}\n",
        AIDC,
      ),
    );
    expect(ids(fs)).toEqual(["tex/required-section:missing"]);
    expect(fs[0]?.line).toBe(1);
  });

  it("presets that require no section are silent, whatever the paper has", () => {
    expect(
      required(
        lint(paper("\\documentclass[sigconf]{acmart}"), {
          extends: "paperlint:aisec",
          kind: "research",
        }),
      ),
    ).toEqual([]);
  });

  it("a position other than last (none): anywhere will do; a child's list replaces its parent's", () => {
    const own = `${PAPER}/own.jsonc`;
    const extra = {
      [own]: JSON.stringify({
        extends: "paperlint:aidc",
        required_sections: [{ title: "Ethics" }],
      }),
    };
    const settings = { extends: "./own.jsonc", kind: "regular" };
    expect(
      lint(aidcPaper("\\section{Ethics}\nx\n" + BODY), settings, { extra }),
    ).toEqual([]);
    expect(ids(required(lint(aidcPaper(BODY), settings, { extra })))).toEqual([
      "tex/required-section:missing",
    ]);
  });
});

describe("paperlint's own config", () => {
  it.each(Object.entries(TEX_VENUE_RULE_LEVELS))(
    "turns %s on at %s for every paper.tex, and ships it",
    (id, level) => {
      const tex = buildConfig({}, { sentinel: "tex" }).find((b) =>
        b.files?.includes("**/paper.tex"),
      );
      expect(tex?.rules?.[id]).toBe(level);
      expect(SHIPPED_RULES.has(id)).toBe(true);
    },
  );

  it("the levels: template and required-section are errors", () => {
    expect(TEX_VENUE_RULE_LEVELS).toMatchObject({
      "tex/template": "error",
      "tex/required-section": "error",
    });
  });
});
