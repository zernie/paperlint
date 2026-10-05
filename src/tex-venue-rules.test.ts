/**
 * The venue-conformance rules over `paper.tex` (`src/tex-venue-rules.ts`), on a paper held in
 * memory beside the SHIPPED presets, so a preset edit that breaks a check shows here. Each rule has
 * both halves: the finding a planted defect produces, and the silence of a conforming source.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import { latexReader } from "./adapters/latex/index.ts";
import {
  cyclePortRules,
  judgeRequiredSections,
  judgeTemplate,
  otherVenues,
  FORMAT_RULE_LEVELS,
  formatRules,
  TEX_VENUE_RULE_LEVELS,
  texVenueRules,
} from "./tex-venue-rules.ts";
import { resolvePreset } from "./presets.ts";
import { buildConfig, SHIPPED_RULES } from "./cli.ts";
import { venuePreset } from "../test/support.ts";

const VENUES = presetsDir();
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
  const deps = { files, venuesDir: VENUES, latex: latexReader };
  for (const [id, rule] of [
    ...Object.entries(texVenueRules(deps)).map(
      ([n, r]) => [`tex/${n}`, r] as const,
    ),
    ...Object.entries(formatRules(deps)).map(
      ([n, r]) => [`format/${n}`, r] as const,
    ),
    ...Object.entries(cyclePortRules(deps)).map(
      ([n, r]) => [`cycle/${n}`, r] as const,
    ),
  ]) {
    const visitor = rule.create({
      filename,
      sourceCode: {
        text: tex,
        ...(raw ? { raw: tex } : {}),
        getLocFromIndex: locOf(tex),
      },
      report: (d) =>
        out.push({
          rule: id,
          // A finding from an included file arrives as a whole message, its file at the front.
          messageId: "messageId" in d ? d.messageId : "(message)",
          message:
            "messageId" in d
              ? Object.entries(d.data ?? {}).reduce(
                  (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
                  rule.meta.messages[d.messageId] ??
                    `(no message ${d.messageId})`,
                )
              : d.message,
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
      /the class option `compsoc` is missing: AIDC requires `\\documentclass\[conference,compsoc\]\{IEEEtran\}`/,
    ],
    [
      "{acmart} under an IEEE preset",
      "\\documentclass[sigconf]{acmart}",
      ["tex/template:wrongClass"],
      /the class is `acmart`, and AIDC requires/,
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
});

describe("tex/template — the class line's states: missing, empty, commented out", () => {
  it("a paper with no \\documentclass at all says so, at the top", () => {
    const fs = lint(
      "\\begin{document}x\\section*{LLM Usage Statement}\\end{document}\n",
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:noClass"]);
    expect(fs[0]?.line).toBe(1);
  });

  it("🔴 \\documentclass{} names no class: an empty class, reported on its own line — not a missing one at the top", () => {
    const fs = lint(
      "% header\n\\documentclass{}\n\\begin{document}x\\section*{LLM Usage Statement}\\end{document}\n",
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:emptyClass"]);
    expect(fs[0]?.line).toBe(2);
    expect(fs[0]?.message).toBe(
      "the \\documentclass names no class; AIDC requires `\\documentclass[conference,compsoc]{IEEEtran}`",
    );
  });

  it("a \\documentclass inside a comment is not the paper's class", () => {
    const fs = lint(
      "% \\documentclass[conference,compsoc]{IEEEtran}\n\\documentclass{article}\n\\section*{LLM Usage Statement}\n",
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:wrongClass"]);
  });
});

describe("the venue rules read the whole paper: the files it \\inputs, spliced where they stand", () => {
  it("🔴 a required section kept in an included file is found, and its order judged in the paper", () => {
    const tex = paper(
      "\\documentclass[conference,compsoc]{IEEEtran}",
      "Text.\n\\input{sections/closing}",
    );
    const extra = {
      [`${PAPER}/sections/closing.tex`]:
        "\\section*{LLM Usage Statement}\nNone.\n",
    };
    expect(lint(tex, AIDC, { extra })).toEqual([]);
    // Without the file, the section is missing.
    expect(ids(lint(tex, AIDC))).toEqual(["tex/required-section:missing"]);
  });

  it("a leftover venue name in an included file is reported at the \\input, naming the file and line", () => {
    const tex = paper(
      "\\documentclass[conference,compsoc]{IEEEtran}",
      "Text.\n\\input{intro}\n\\section*{LLM Usage Statement}\nNone.",
    );
    const fs = lint(tex, AIDC, {
      extra: {
        [`${PAPER}/intro.tex`]: "One line.\nFirst written for AgenticDev.\n",
      },
    });
    expect(fs.map((f) => [f.line, f.message.split(": ")[0]])).toEqual([
      [5, "intro.tex:2:19"],
    ]);
  });
});

describe("tex/template — several \\documentclass lines behind a TeX switch", () => {
  /** One source for two venues, the class picked by `\\if` — as an accepted ACSAC paper does it. */
  const switched = (a: string, b: string) =>
    paper(
      `\\def\\venue{2}\n\\if\\venue1\n${a}\n\\fi\n\\if\\venue2\n${b}\n\\fi`,
    );

  it("passes when one of the candidates is the preset's class with its options", () => {
    expect(
      lint(
        switched(
          "\\documentclass[letterpaper,twocolumn]{article}",
          "\\documentclass[conference,compsoc]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("reports once, at the first candidate, naming every candidate, when none is the preset's", () => {
    const fs = lint(
      switched(
        "\\documentclass{article}",
        "\\documentclass[conference]{IEEEtran}",
      ),
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:noCandidate"]);
    // Line 4: the first candidate, after the comment, `\\def` and `\\if` lines.
    expect(fs[0]?.line).toBe(4);
    expect(fs[0]?.message).toBe(
      "none of the 2 \\documentclass lines is `\\documentclass[conference,compsoc]{IEEEtran}`, which AIDC requires: `\\documentclass{article}`, `\\documentclass[conference]{IEEEtran}`. The source picks one behind a TeX switch, which is not evaluated; make one of them the venue's",
    );
  });

  it("an empty candidate is named as such", () => {
    const fs = lint(
      switched("\\documentclass{}", "\\documentclass{article}"),
      AIDC,
    );
    expect(fs[0]?.message).toMatch(
      /`\\documentclass\{\}`, `\\documentclass\{article\}`/,
    );
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

const PORTING = {
  id: "aidc-2026",
  venue: { kind: "preset", extends: "paperlint:aidc" },
  kind: "regular",
  opened: "2026-09-26",
  phase: "porting",
};

describe("tex/template — a cycle in `porting`", () => {
  it("the class line is the previous venue's by declaration: silent, where the flat form reports", () => {
    const src = paper("\\documentclass[sigconf]{acmart}");
    expect(lint(src, AIDC).map((f) => f.messageId)).toEqual(["wrongClass"]);
    expect(lint(src, { cycles: [PORTING] })).toEqual([]);
    expect(
      lint(src, { cycles: [{ ...PORTING, phase: "prepared" }] }).map(
        (f) => f.messageId,
      ),
    ).toEqual(["wrongClass"]);
  });
});

describe("cycle/port-done — the declared port is finished", () => {
  it("porting declared and the class line already the venue's: the one finding, naming the cycle", () => {
    const fs = lint(OFFICIAL, { cycles: [PORTING] });
    expect(fs.map((f) => `${f.rule}:${f.messageId}`)).toEqual([
      "cycle/port-done:done",
    ]);
    expect(fs[0]?.message).toMatch(
      /already `\\documentclass\[conference,compsoc\]\{IEEEtran\}`, which AIDC requires, and the cycle «aidc-2026» still declares "phase": "porting"/,
    );
  });

  it("silent while the class line is still the old venue's, once the phase is dropped, and on the flat form", () => {
    const old = paper("\\documentclass[sigconf]{acmart}");
    expect(lint(old, { cycles: [PORTING] })).toEqual([]);
    expect(
      lint(OFFICIAL, { cycles: [{ ...PORTING, phase: "prepared" }] }),
    ).toEqual([]);
    expect(lint(OFFICIAL, AIDC)).toEqual([]);
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
          extra: {
            [own]: JSON.stringify({
              type: "family",
              tex: { packages: { x: ["x"] } },
            }),
          },
        },
      ),
    ).toEqual([]);
  });
});

/** A project's own venue on IEEEtran's conference class that forbids the two compsoc options. */
const forbidding = (body: Record<string, unknown> = {}) => ({
  [`${PAPER}/own.jsonc`]: JSON.stringify(
    venuePreset("Own", {
      extends: "paperlint:ieee-conference",
      template: "\\documentclass[10pt,conference]{IEEEtran}",
      template_forbids: ["compsoc", "compsocconf"],
      ...body,
    }),
  ),
});

describe("tex/template — class options the preset forbids (`template_forbids`)", () => {
  const judge = (cls: string, extra = forbidding()) =>
    lint(paper(cls, "Text."), { extends: "./own.jsonc" }, { extra });

  it("the template's own line passes, and so does an extra option the preset does not forbid", () => {
    expect(judge("\\documentclass[10pt,conference]{IEEEtran}")).toEqual([]);
    expect(
      judge("\\documentclass[10pt,conference,letterpaper]{IEEEtran}"),
    ).toEqual([]);
  });

  it("🔴 a forbidden option is reported at the class line, naming it and the venue's line", () => {
    const fs = judge("\\documentclass[10pt,conference,compsoc]{IEEEtran}");
    expect(ids(fs)).toEqual(["tex/template:forbiddenOption"]);
    expect(fs[0]?.message).toBe(
      "the class option `compsoc` is forbidden: Own requires `\\documentclass[10pt,conference]{IEEEtran}` without `compsoc`, `compsocconf`",
    );
    expect(fs[0]?.line).toBe(2);
  });

  it("each forbidden option is one finding, beside a missing one", () => {
    expect(
      ids(judge("\\documentclass[compsoc,compsocconf,conference]{IEEEtran}")),
    ).toEqual([
      "tex/template:forbiddenOption",
      "tex/template:forbiddenOption",
      "tex/template:missingOption",
    ]);
  });
});

describe("tex/template under paperlint:msr — `[10pt,conference]`, without compsoc or compsocconf", () => {
  const MSR = { extends: "paperlint:msr", kind: "technical" };

  it("the class line MSR's call names passes", () => {
    expect(
      lint(paper("\\documentclass[10pt,conference]{IEEEtran}", "Text."), MSR),
    ).toEqual([]);
  });

  it.each([["compsoc"], ["compsocconf"]])(
    "🔴 `%s` in the class options fails tex/template",
    (option) => {
      const fs = lint(
        paper(`\\documentclass[10pt,conference,${option}]{IEEEtran}`, "Text."),
        MSR,
      );
      expect(ids(fs)).toEqual(["tex/template:forbiddenOption"]);
      expect(fs[0]?.message).toMatch(
        `the class option \`${option}\` is forbidden: MSR requires`,
      );
    },
  );

  it("AIDC's class line fails MSR on both counts: compsoc forbidden, 10pt missing", () => {
    expect(ids(lint(OFFICIAL, MSR))).toEqual([
      "tex/template:forbiddenOption",
      "tex/template:missingOption",
    ]);
  });
});

describe("tex/template — forbidden options behind a switch, and down a chain", () => {
  it("behind a TeX switch, a candidate with a forbidden option is not the venue's class", () => {
    const two = (a: string, b: string) =>
      `\\def\\v{1}\n\\if\\v1 ${a} \\fi\n\\if\\v2 ${b} \\fi\n\\begin{document}\nText.\n\\end{document}\n`;
    const compsoc = "\\documentclass[10pt,conference,compsoc]{IEEEtran}";
    const opts = { extra: forbidding() };
    expect(
      ids(lint(two(compsoc, compsoc), { extends: "./own.jsonc" }, opts)),
    ).toEqual(["tex/template:noCandidate"]);
    expect(
      lint(
        two(compsoc, "\\documentclass[10pt,conference]{IEEEtran}"),
        { extends: "./own.jsonc" },
        opts,
      ),
    ).toEqual([]);
  });

  it("a child's template replaces its parent's, the forbidden options with it", () => {
    const child = `${PAPER}/child.jsonc`;
    const extra = {
      ...forbidding(),
      [child]: JSON.stringify(
        venuePreset("Child", {
          extends: "./own.jsonc",
          template: "\\documentclass[conference]{IEEEtran}",
        }),
      ),
    };
    expect(
      lint(
        paper("\\documentclass[conference,compsoc]{IEEEtran}", "Text."),
        { extends: "./child.jsonc" },
        { extra },
      ),
    ).toEqual([]);
  });
});

describe("tex/template — a template the reader cannot read, a bare class name, nothing to judge", () => {
  it("a template the reader cannot read is said once, naming its file — the class is not judged", () => {
    const own = `${PAPER}/own.jsonc`;
    const fs = lint(
      paper("\\documentclass{article}"),
      { extends: "./own.jsonc" },
      {
        extra: {
          [own]: JSON.stringify({
            type: "family",
            template: "\\documentclass[a]{}",
            tex: { packages: { x: ["x"] } },
          }),
        },
      },
    );
    expect(ids(fs)).toEqual(["tex/template:badTemplate"]);
    expect(fs[0]?.message).toBe(
      `${own}: the preset's "template" "\\\\documentclass[a]{}" is neither a \\documentclass line nor a class name, so the class cannot be checked`,
    );
  });

  it("a bare class name as the template names the class and no option", () => {
    const own = `${PAPER}/own.jsonc`;
    const extra = {
      [own]: JSON.stringify({
        type: "family",
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
});

describe("tex/template — nothing to judge", () => {
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
      "AIDC requires a section titled «LLM Usage Statement» and there is none — add `\\section*{LLM Usage Statement}` (the title exactly; a bold paragraph does not count)",
    );
    // At `\end{document}`, where the section would go.
    expect(fs[0]?.line).toBe(tex.split("\n").indexOf("\\end{document}") + 1);
  });

  it("🔴 a heading inside a macro definition or a comment environment is not in the PDF: missing", () => {
    const tex = aidcPaper(
      BODY +
        BIB +
        "\\newcommand{\\stmt}{\\section*{LLM Usage Statement}}\n" +
        "\\begin{comment}\n\\section*{LLM Usage Statement}\n\\end{comment}\n",
    );
    expect(ids(required(lint(tex, AIDC)))).toEqual([
      "tex/required-section:missing",
    ]);
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
      [own]: JSON.stringify(
        venuePreset("own", {
          extends: "paperlint:aidc",
          required_sections: [{ title: "Ethics" }],
        }),
      ),
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

const INSTITUTION =
  "\\institution{Presented at AISec 2026, co-located with ACM CCS}";
const leftovers = (fs: readonly Finding[]) =>
  fs.filter((f) => f.rule === "tex/venue-leftover");

describe("tex/venue-leftover — another venue named in the text", () => {
  it("🔴 the author-block line fails under aidc: both names, on that line", () => {
    const tex = aidcPaper(`${INSTITUTION}\n${BODY}${STATEMENT}`);
    const fs = leftovers(lint(tex, AIDC));
    expect(fs.map((f) => f.message)).toEqual([
      "«AISec» names AISec, and this paper extends AIDC — a leftover from an earlier submission? A reviewer reads it before the abstract. Comments and citation keys are not reported; a sentence that names the other venue on purpose can keep it with a disable directive",
      expect.stringContaining("«ACM CCS» names AISec"),
    ]);
    const line = tex.split("\n").indexOf(INSTITUTION) + 1;
    expect(fs.map((f) => f.line)).toEqual([line, line]);
  });

  it("the same line passes under aisec — it is that venue's own name", () => {
    const tex = paper(
      "\\documentclass[sigconf]{acmart}",
      `${INSTITUTION}\nText.`,
    );
    expect(
      leftovers(lint(tex, { extends: "paperlint:aisec", kind: "research" })),
    ).toEqual([]);
  });

  it("a \\cite key and a comment naming it produce no finding", () => {
    const tex = aidcPaper(
      `As shown~\\cite{aisec2025,AISec} and \\citep{AISec}. % AISec 2026\n${BODY}${STATEMENT}`,
    );
    expect(leftovers(lint(tex, AIDC))).toEqual([]);
  });

  it("a citation's note in square brackets is printed, so it is reported", () => {
    const tex = aidcPaper(
      `As shown~\\citep[presented at AISec]{aisec2025}.\n${BODY}${STATEMENT}`,
    );
    expect(leftovers(lint(tex, AIDC)).map((f) => f.line)).toEqual([4]);
  });

  it("the bibliography, math, code and labels are not the text a reader sees as the venue's", () => {
    const tex = aidcPaper(
      `$AISec$ \\label{AISec} \\ref{AISec} \\url{https://AISec.cc} \\begin{verbatim}AISec\\end{verbatim}\n` +
        `${BODY}${STATEMENT}\\begin{thebibliography}{1}\\bibitem{a} In Proc. AISec.\\end{thebibliography}\n`,
    );
    expect(leftovers(lint(tex, AIDC))).toEqual([]);
  });
});

describe("tex/venue-leftover — MSR, a name that is also an acronym, counts only with a year (`mentions`)", () => {
  const under = (text: string) =>
    leftovers(lint(aidcPaper(`${text}\n${BODY}${STATEMENT}`), AIDC));

  it.each([
    [
      "an acronym the paper defines",
      "We score it by Manual Speech Recognition (MSR), and MSR scores rise.",
    ],
    [
      "Microsoft Research",
      "Researchers at Microsoft Research (MSR) built it, and MSR released it.",
    ],
    [
      "a citation of an MSR paper: the key, and the entry in the bibliography",
      "As shown~\\cite{msr2024}.\n\\begin{thebibliography}{1}\\bibitem{msr2024} A. Author, ``Mining,'' in \\emph{Proc. MSR 2024}, 2024.\\end{thebibliography}",
    ],
    ["a year that is not beside the name", "MSR, in 2027, scored best."],
  ])("silent: %s", (_, text) => {
    expect(under(text)).toEqual([]);
  });

  it.each([
    ["First written for MSR 2027.", "MSR"],
    ["A version appeared as MSR'27 work.", "MSR"],
    ["Submitted to MSR~2027.", "MSR"],
  ])("🔴 reported: «%s»", (text, name) => {
    const fs = under(text);
    expect(fs.map((f) => f.message)).toEqual([
      expect.stringMatching(
        new RegExp(`^«${name}» names MSR, and this paper extends AIDC`),
      ),
    ]);
    expect(fs[0]?.line).toBe(4);
  });

  it("under msr itself, its own name with a year is never a leftover", () => {
    const tex = paper(
      "\\documentclass[10pt,conference]{IEEEtran}",
      "First written for MSR 2027.",
    );
    expect(
      leftovers(lint(tex, { extends: "paperlint:msr", kind: "technical" })),
    ).toEqual([]);
  });
});

describe("tex/venue-leftover — a URL is not text, a definition body is", () => {
  it("\\href: a name in the URL is not reported, a name in the link text is", () => {
    const inUrl = aidcPaper(
      `See \\href{https://example.org/AISec/2026}{the workshop}.\n${BODY}${STATEMENT}`,
    );
    expect(leftovers(lint(inUrl, AIDC))).toEqual([]);
    const inText = aidcPaper(
      `See \\href{https://example.org/}{AISec 2026}.\n${BODY}${STATEMENT}`,
    );
    expect(leftovers(lint(inText, AIDC)).map((f) => f.line)).toEqual([4]);
  });

  it.each<[string, string]>([
    ["unused", ""],
    ["used", "Submitted to \\oldvenue.\n"],
  ])(
    "a macro definition naming another venue is reported at the definition, %s",
    (_, use) => {
      const tex = aidcPaper(
        `\\newcommand{\\oldvenue}{AISec}\n${use}${BODY}${STATEMENT}`,
      );
      const fs = leftovers(lint(tex, AIDC));
      expect(fs.map((f) => [f.line, f.message.slice(0, 16)])).toEqual([
        [4, "«AISec» names AI"],
      ]);
    },
  );
});

describe("tex/venue-leftover — where names are found, and whose they are", () => {
  it.each<[string, string, string[]]>([
    [
      "the preamble's \\acmConference",
      "\\acmConference[AISec '26]{x}",
      ["AISec"],
    ],
    ["a footnote", "Text.\\footnote{Submitted to REALM.}", ["REALM"]],
    ["a tie inside the name", "ACM~CCS", ["ACM CCS"]],
    [
      "whole words only: AISecX and xAIDC are other words",
      "AISecX, EMNLPs and AgenticDevOps.",
      [],
    ],
    ["case matters: aisec is not AISec", "aisec.cc", []],
  ])("%s", (_, text, want) => {
    const tex = aidcPaper(`${text}\n${BODY}${STATEMENT}`);
    expect(
      leftovers(lint(tex, AIDC)).map((f) => /«(.*?)»/u.exec(f.message)?.[1]),
    ).toEqual(want);
  });

  it("a name a venue shares with this paper's own chain is not a leftover", () => {
    const own = `${PAPER}/own.jsonc`;
    const extra = {
      [own]: JSON.stringify(
        venuePreset("AIDC 2027", {
          extends: "paperlint:aidc",
          aliases: ["ACM CCS"],
        }),
      ),
    };
    const tex = aidcPaper(`ACM CCS and AIDC 2027.\n${BODY}${STATEMENT}`);
    expect(
      leftovers(
        lint(tex, { extends: "./own.jsonc", kind: "regular" }, { extra }),
      ),
    ).toEqual([]);
  });

  it("under a family, a venue that extends it is another venue", () => {
    // ieee-conference is on aidc's chain, so under the family aidc is ANOTHER venue.
    const tex = paper(
      "\\documentclass[conference]{IEEEtran}",
      "Accepted at AIDC. Formerly at AISec.",
    );
    expect(
      leftovers(lint(tex, { extends: "paperlint:ieee-conference" }))
        .map((f) => /«(.*?)»/u.exec(f.message)?.[1])
        .sort(),
    ).toEqual(["AIDC", "AISec"]);
  });
});

describe("the judges, on places the parser did not give", () => {
  const files = memoryFiles(shipped);
  const aidc = resolvePreset("paperlint:aidc", `${PAPER}/paperlint.json`, {
    files,
    venuesDir: VENUES,
  });
  const preset = aidc.ok ? aidc.value : null;

  it("a class line with no place is reported at the top of the file, not at an invented offset", () => {
    expect(preset).not.toBeNull();
    if (preset === null) return;
    expect(
      judgeTemplate(
        { kind: "empty", place: { kind: "unplaced" } },
        preset,
        latexReader,
      ),
    ).toMatchObject([{ messageId: "emptyClass", at: null }]);
  });

  it("a required section with no place is never out of order; a section with no place is not counted as after it", () => {
    expect(preset).not.toBeNull();
    if (preset === null) return;
    const at = (start: number) => ({
      kind: "at" as const,
      span: { start, end: start + 1 },
    });
    const statement = "LLM Usage Statement";
    expect(
      judgeRequiredSections(
        () => ({
          sections: [
            { title: statement, place: { kind: "unplaced" } },
            { title: "Introduction", place: at(50) },
          ],
          backMatter: null,
          end: 99,
        }),
        preset,
      ),
    ).toEqual([]);
    expect(
      judgeRequiredSections(
        () => ({
          sections: [
            { title: statement, place: at(10) },
            { title: "Introduction", place: { kind: "unplaced" } },
          ],
          backMatter: null,
          end: 99,
        }),
        preset,
      ),
    ).toEqual([]);
  });
});

describe("otherVenues", () => {
  it("every shipped venue off the paper's chain; one that does not resolve is skipped", () => {
    const files = memoryFiles(
      Object.fromEntries(
        Object.entries(shipped).filter(([f]) => !f.endsWith("realm.jsonc")),
      ),
    );
    const deps = { files, venuesDir: VENUES };
    const from = `${PAPER}/paperlint.json`;
    const aidc = resolvePreset("paperlint:aidc", from, deps);
    expect(aidc.ok).toBe(true);
    if (!aidc.ok) return;
    expect(otherVenues(aidc.value, deps).map((o) => o.label)).toEqual([
      "acm-sigconf",
      "AgenticDev",
      "AISec",
      "MSR",
    ]);
  });
});

describe("paperlint's own config", () => {
  it.each(Object.entries({ ...TEX_VENUE_RULE_LEVELS, ...FORMAT_RULE_LEVELS }))(
    "turns %s on at %s for every paper.tex, and ships it",
    (id, level) => {
      const tex = buildConfig({}, { sentinel: "tex" }).find((b) =>
        b.files?.includes("**/paper.tex"),
      );
      expect(tex?.rules?.[id]).toBe(level);
      expect(SHIPPED_RULES.has(id)).toBe(true);
    },
  );

  it("the levels: template and required-section are errors, venue-leftover a warning", () => {
    expect(TEX_VENUE_RULE_LEVELS).toEqual({
      "tex/template": "error",
      "tex/required-section": "error",
      "tex/venue-leftover": "warn",
    });
  });

  it("format/layout-override is an error: the layout it guards is the template's", () => {
    expect(FORMAT_RULE_LEVELS).toEqual({ "format/layout-override": "error" });
  });
});

/** A conforming AIDC paper with `preamble` after its class line, and `body` before its statement. */
const withPreamble = (preamble: string, body = "Text.") =>
  paper(
    `\\documentclass[conference,compsoc]{IEEEtran}\n${preamble}`,
    `${body}\n\\section*{LLM Usage Statement}\nNone.`,
  );
const overrides = (tex: string, settings: object | undefined = AIDC) =>
  lint(tex, settings).filter((f) => f.rule === "format/layout-override");

describe("format/layout-override reports", () => {
  it("each command that changes the template's layout, on its own line", () => {
    const tex = withPreamble(
      [
        "\\usepackage[margin=1in]{geometry}",
        "\\usepackage{amsmath,geometry}",
        "\\setlength{\\textheight}{9.5in}",
        "\\addtolength\\textwidth{1in}",
        "\\setlength{\\columnsep}{0.1in}",
        "\\linespread{0.95}",
        "\\renewcommand{\\baselinestretch}{0.9}",
        "\\geometry{left=1cm}",
      ].join("\n"),
      "Text.\n\\newgeometry{top=1cm}\nMore text.",
    );
    expect(
      overrides(tex).map((f) => [f.line, f.message.split("`")[1]]),
    ).toEqual([
      [3, "\\usepackage{geometry}"],
      [4, "\\usepackage{geometry}"],
      [5, "\\setlength{\\textheight}"],
      [6, "\\addtolength{\\textwidth}"],
      [7, "\\setlength{\\columnsep}"],
      [8, "\\linespread{0.95}"],
      [9, "\\renewcommand{\\baselinestretch}"],
      [10, "\\geometry"],
      [13, "\\newgeometry"],
    ]);
    expect(overrides(tex)[0]?.message).toBe(
      "`\\usepackage{geometry}` changes the page layout AIDC's template sets (`\\documentclass[conference,compsoc]{IEEEtran}`) — a desk-reject reason at venues that check the format. Remove it; if the venue allows it, disable this line with a comment saying so",
    );
  });
  it("a definition's body counts: the length it sets is set wherever it is used", () => {
    const tex = withPreamble(
      "\\newcommand{\\tall}{\\setlength{\\textheight}{10in}}",
    );
    expect(overrides(tex).map((f) => f.line)).toEqual([3]);
  });
});

describe("format/layout-override stays silent", () => {
  it("silent on what leaves the layout alone", () => {
    const tex = withPreamble(
      [
        "\\usepackage{amsmath}",
        "\\setlength{\\parindent}{0pt}",
        "\\renewcommand{\\thesection}{\\arabic{section}}",
        "% \\usepackage{geometry} in a comment",
        "\\begin{comment}\\linespread{0.9}\\end{comment}",
        // A length command with no arguments at all names no length.
        "{\\setlength}",
      ].join("\n"),
      "A \\vspace{2mm} B \\vskip 3pt C \\vskip\\baselineskip D.",
    );
    expect(overrides(tex)).toEqual([]);
  });

  it("silent on local space pulled back: no venue's call names a negative skip", () => {
    const tex = withPreamble(
      "\\newcommand{\\tight}{\\vspace{-3pt}}",
      "A \\vspace{-2mm} B \\vspace*{-1em} C \\vskip -3pt D.",
    );
    expect(lint(tex, AIDC)).toEqual([]);
  });

  it("silent without a preset, or with one that names no template", () => {
    const tex = withPreamble("\\usepackage{geometry}");
    expect(
      lint(tex, undefined).filter((f) => f.rule === "format/layout-override"),
    ).toEqual([]);
    expect(overrides(tex, { extends: null })).toEqual([]);
    const house = {
      [`${PAPER}/house.jsonc`]: JSON.stringify({
        type: "family",
        tex: { packages: { ieeetran: ["IEEEtran.cls"] } },
      }),
    };
    expect(
      lint(tex, { extends: "./house.jsonc" }, { extra: house }).filter(
        (f) => f.rule === "format/layout-override",
      ),
    ).toEqual([]);
  });
});
