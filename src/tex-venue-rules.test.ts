/**
 * The venue-conformance rules over `paper.tex` (`src/tex-venue-rules.ts`), on a paper held in
 * memory beside the SHIPPED presets, so a preset edit that breaks a check shows here. Each rule has
 * both halves: the finding a planted defect produces, and the silence of a conforming source.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import {
  judgeRequiredSections,
  judgeStyle,
  judgeTemplate,
  otherStyles,
  otherVenues,
  FORMAT_RULE_LEVELS,
  TEX_VENUE_RULE_LEVELS,
} from "./tex-venue-rules.ts";
import { resolvePreset } from "./presets.ts";
import { buildConfig, SHIPPED_RULES } from "./cli.ts";
import { builtPaper } from "../test/recorded-fixture.ts";
import { venuePreset } from "../test/support.ts";
import { shippedVenuesExcept } from "../test/shipped-venues.ts";
import {
  lint,
  PAPER,
  READERS,
  shipped,
  VENUES,
  type Finding,
} from "../test/venue-rules-lint.ts";

const ids = (fs: readonly Finding[]) =>
  fs.map((f) => `${f.rule}:${f.messageId}`).sort();

const AIDC = { extends: "paperlint:aidc-2026", kind: "regular" };
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
    // The build recorded TeX reading both files.
    const extra = builtPaper(
      PAPER,
      {
        "paper.tex": tex,
        "sections/closing.tex": "\\section*{LLM Usage Statement}\nNone.\n",
      },
      [
        { path: "paper.tex", role: "body" },
        { path: "sections/closing.tex", role: "body" },
      ],
    );
    expect(lint(tex, AIDC, { extra })).toEqual([]);
    // Without the file, the section is missing.
    expect(ids(lint(tex, AIDC))).toEqual(["tex/required-section:missing"]);
    // 🔴 The file on disk and no record of the build: the paper is paper.tex, and the section is missing.
    const unbuilt = {
      [`${PAPER}/sections/closing.tex`]:
        "\\section*{LLM Usage Statement}\nNone.\n",
    };
    expect(ids(lint(tex, AIDC, { extra: unbuilt }))).toEqual([
      "tex/required-section:missing",
    ]);
  });

  it("a leftover venue name in an included file is reported at the \\input, naming the file and line", () => {
    const tex = paper(
      "\\documentclass[conference,compsoc]{IEEEtran}",
      "Text.\n\\input{intro}\n\\section*{LLM Usage Statement}\nNone.",
    );
    const fs = lint(tex, AIDC, {
      extra: builtPaper(
        PAPER,
        {
          "paper.tex": tex,
          "intro.tex": "One line.\nFirst written for AgenticDev 2026.\n",
        },
        [
          { path: "paper.tex", role: "body" },
          { path: "intro.tex", role: "body" },
        ],
      ),
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

const MSR = { extends: "paperlint:msr-2027", kind: "technical" };

describe("tex/template — options passed before the class line (`\\PassOptionsToClass`)", () => {
  it("🔴 an option passed to the class before \\documentclass is in effect: no missing-option finding", () => {
    expect(
      lint(
        paper(
          "\\PassOptionsToClass{compsoc}{IEEEtran}\n\\documentclass[conference]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("several options in one call, spaces and all, and a class line with no options of its own", () => {
    expect(
      lint(
        paper(
          "\\PassOptionsToClass{ conference , compsoc }{ IEEEtran }\n\\documentclass{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("🔴 a forbidden option passed before the class line is reported where it is passed", () => {
    const fs = lint(
      paper(
        "\\PassOptionsToClass{compsoc}{IEEEtran}\n\\documentclass[10pt,conference]{IEEEtran}",
        "Text.",
      ),
      MSR,
    );
    expect(ids(fs)).toEqual(["tex/template:forbiddenOption"]);
    expect(fs[0]?.message).toBe(
      "the class option `compsoc` is forbidden: MSR requires `\\documentclass[10pt,conference]{IEEEtran}` without `compsoc`, `compsocconf`",
    );
    expect(fs[0]?.line).toBe(2);
  });
});

describe("tex/template — `\\PassOptionsToClass` counts only before the line, for its class", () => {
  it("options passed to another class, or after the class line, are not in effect", () => {
    expect(
      ids(
        lint(
          paper(
            "\\PassOptionsToClass{compsoc}{article}\n\\documentclass[conference]{IEEEtran}",
          ),
          AIDC,
        ),
      ),
    ).toEqual(["tex/template:missingOption"]);
    expect(
      ids(
        lint(
          paper(
            "\\documentclass[conference]{IEEEtran}\n\\PassOptionsToClass{compsoc}{IEEEtran}",
          ),
          AIDC,
        ),
      ),
    ).toEqual(["tex/template:missingOption"]);
  });

  it("behind a TeX switch, an option passed before a candidate counts for it", () => {
    expect(
      lint(
        paper(
          "\\PassOptionsToClass{compsoc}{IEEEtran}\n\\if\\v1 \\documentclass{article} \\fi\n\\if\\v2 \\documentclass[conference]{IEEEtran} \\fi",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });
});

describe("tex/template — a class line built by a macro is not read, and not reported", () => {
  it("🔴 options from a macro: no missing-option finding", () => {
    expect(
      lint(
        paper(
          "\\newcommand{\\opts}{conference,compsoc}\n\\documentclass[\\opts]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("🔴 one option from a macro beside literal ones: no missing-option finding", () => {
    expect(
      lint(
        paper(
          "\\def\\venuemode{conference}\n\\documentclass[\\venuemode,compsoc]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("a literal forbidden option beside a macro is still reported: it is in effect whatever the macro holds", () => {
    expect(
      ids(
        lint(
          paper(
            "\\def\\venuemode{conference}\n\\documentclass[10pt,\\venuemode,compsoc]{IEEEtran}",
            "Text.",
          ),
          MSR,
        ),
      ),
    ).toEqual(["tex/template:forbiddenOption"]);
  });
});

describe("tex/template — a class name built by a macro, and a class line out of reach", () => {
  it("🔴 the class name from a macro: no finding", () => {
    expect(
      lint(
        paper(
          "\\def\\cls{IEEEtran}\n\\documentclass[conference,compsoc]{\\cls}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("behind a TeX switch, a candidate built by a macro may be the venue's: no finding", () => {
    expect(
      lint(
        paper(
          "\\if\\v1 \\documentclass{article} \\fi\n\\if\\v2 \\documentclass[\\opts]{IEEEtran} \\fi",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("the other half: an option that is no macro, beside the venue's class, still fires", () => {
    expect(
      ids(lint(paper("\\documentclass[conference,a4paper]{IEEEtran}"), AIDC)),
    ).toEqual(["tex/template:missingOption"]);
  });

  it("🔴 a \\documentclass the parser reads as another macro's argument is not called missing", () => {
    // unified-latex knows `\mode` (beamer's, with an argument), so `\def` takes the class line as
    // its body: the line is in the tree, not at its top.
    expect(
      lint(
        paper(
          "\\def\\mode{conference}\n\\documentclass[conference,compsoc]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });
});

describe("tex/template — a \\documentclass TeX never reads", () => {
  it("in a verbatim block or a filecontents block: not the paper's class", () => {
    const body =
      "\\begin{verbatim}\n\\documentclass{article}\n\\end{verbatim}\n\\section*{LLM Usage Statement}\nNone.";
    expect(
      lint(paper("\\documentclass[conference,compsoc]{IEEEtran}", body), AIDC),
    ).toEqual([]);
    expect(
      lint(
        paper(
          "\\begin{filecontents*}{old.tex}\n\\documentclass{article}\n\\end{filecontents*}\n\\documentclass[conference,compsoc]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
  });

  it("behind \\iffalse … \\fi: not a candidate — the live line alone is judged", () => {
    expect(
      lint(
        paper(
          "\\iffalse\n\\documentclass{article}\n\\fi\n\\documentclass[conference,compsoc]{IEEEtran}",
        ),
        AIDC,
      ),
    ).toEqual([]);
    // The other half: the venue's line behind \iffalse does not rescue a wrong live line.
    const fs = lint(
      paper(
        "\\iffalse\n\\documentclass[conference,compsoc]{IEEEtran}\n\\fi\n\\documentclass[conference]{IEEEtran}",
      ),
      AIDC,
    );
    expect(ids(fs)).toEqual(["tex/template:missingOption"]);
    expect(fs[0]?.line).toBe(5);
  });

  it("a release date after the class name is not part of it", () => {
    expect(
      lint(
        paper("\\documentclass[conference,compsoc]{IEEEtran}[2015/08/26]"),
        AIDC,
      ),
    ).toEqual([]);
  });
});

describe("tex/template — the class line kept in a file paper.tex \\inputs", () => {
  const tex =
    "\\input{preamble}\n\\begin{document}\nText.\n\\section*{LLM Usage Statement}\nNone.\n\\end{document}\n";

  it("with the build's record, the included class line is judged, both halves", () => {
    const built = (cls: string) =>
      builtPaper(PAPER, { "paper.tex": tex, "preamble.tex": `${cls}\n` }, [
        { path: "paper.tex", role: "body" },
        { path: "preamble.tex", role: "preamble" },
      ]);
    expect(
      lint(tex, AIDC, {
        extra: built("\\documentclass[conference,compsoc]{IEEEtran}"),
      }),
    ).toEqual([]);
    // A finding in an included file arrives as a whole message, at the \input, its file in front.
    const fs = lint(tex, AIDC, {
      extra: built("\\documentclass[conference]{IEEEtran}"),
    });
    expect(fs.map((f) => [f.rule, f.line, f.message])).toEqual([
      [
        "tex/template",
        1,
        "preamble.tex:1:1: the class option `compsoc` is missing: AIDC requires `\\documentclass[conference,compsoc]{IEEEtran}`",
      ],
    ]);
  });

  it("🔴 with no record yet, a paper.tex that \\inputs its preamble is not said to have no class", () => {
    expect(lint(tex, AIDC)).toEqual([]);
  });

  it("an \\input only in the body does not hide a missing class", () => {
    const bodyOnly =
      "\\begin{document}\n\\input{intro}\n\\section*{LLM Usage Statement}\nNone.\n\\end{document}\n";
    expect(ids(lint(bodyOnly, AIDC))).toEqual(["tex/template:noClass"]);
  });
});

describe("tex/template — the shipped ACM and ACL templates", () => {
  it("🔴 acmart without sigconf — the manuscript format — fails every ACM preset", () => {
    for (const settings of [
      { extends: "paperlint:aisec-2026", kind: "research" },
      { extends: "paperlint:agenticdev-2026", kind: "short" },
      { extends: "paperlint:acm-sigconf" },
    ])
      expect(ids(lint(paper("\\documentclass{acmart}"), settings))).toEqual([
        "tex/template:missingOption",
      ]);
    expect(
      lint(paper("\\documentclass[sigconf,review,anonymous]{acmart}"), {
        extends: "paperlint:aisec-2026",
        kind: "research",
      }),
    ).toEqual([]);
  });

  it("🔴 acmart without acmsmall — the manuscript or the sigconf format — fails the single-column family and FSE", () => {
    const FSE = { extends: "paperlint:fse-2027", kind: "research" };
    for (const settings of [{ extends: "paperlint:acm-acmsmall" }, FSE])
      for (const cls of [
        "\\documentclass{acmart}",
        "\\documentclass[sigconf,review,anonymous]{acmart}",
      ])
        expect(lint(paper(cls), settings)).toEqual([
          {
            rule: "tex/template",
            messageId: "missingOption",
            message: `the class option \`acmsmall\` is missing: ${settings === FSE ? "FSE" : "acm-acmsmall"} requires \`\\documentclass[acmsmall]{acmart}\``,
            line: 2,
          },
        ]);
    // The call's own line, and acmsmall without the options it only encourages.
    for (const cls of [
      "\\documentclass[acmsmall,screen,review,anonymous]{acmart}",
      "\\documentclass[acmsmall]{acmart}",
    ])
      expect(lint(paper(cls), FSE)).toEqual([]);
  });
});

const PORTING = {
  id: "aidc-2026",
  venue: { kind: "preset", extends: "paperlint:aidc-2026" },
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

describe("cycle/port-done — only a class line read whole ends the port", () => {
  it("🔴 silent on a class line it cannot read: a line built by a macro is not known to be the venue's", () => {
    const porting = (cls: string) =>
      lint(paper(cls), { cycles: [PORTING] }).filter(
        (f) => f.rule === "cycle/port-done",
      );
    expect(porting("\\documentclass[\\opts]{IEEEtran}")).toEqual([]);
    expect(porting("\\documentclass[conference,compsoc]{\\cls}")).toEqual([]);
    expect(porting("\\input{preamble}")).toEqual([]);
  });

  it("an option passed with \\PassOptionsToClass completes the venue's line; one candidate of a switch is enough", () => {
    const done = (cls: string) => ids(lint(paper(cls), { cycles: [PORTING] }));
    expect(
      done(
        "\\PassOptionsToClass{compsoc}{IEEEtran}\n\\documentclass[conference]{IEEEtran}",
      ),
    ).toEqual(["cycle/port-done:done"]);
    expect(
      done(
        "\\if\\v1 \\documentclass{article} \\fi\n\\if\\v2 \\documentclass[conference,compsoc]{IEEEtran} \\fi",
      ),
    ).toEqual(["cycle/port-done:done"]);
  });

  it("silent when the venue's template cannot be read", () => {
    const own = `${PAPER}/own.jsonc`;
    const extra = {
      [own]: JSON.stringify({
        type: "family",
        template: "\\documentclass[a]{}",
        tex: { packages: { x: ["x"] } },
      }),
    };
    const cycles = [
      { ...PORTING, venue: { kind: "preset", extends: "./own.jsonc" } },
    ];
    expect(
      lint(OFFICIAL, { cycles }, { extra }).filter(
        (f) => f.rule === "cycle/port-done",
      ),
    ).toEqual([]);
  });
});

describe("cycle/port-done — the source code, and nothing to compare", () => {
  it("judges the text when the source carries no `raw`", () => {
    expect(
      lint(OFFICIAL, { cycles: [PORTING] }, { raw: false }).map(
        (f) => `${f.rule}:${f.messageId}`,
      ),
    ).toContain("cycle/port-done:done");
  });

  it("silent when the venue names no template, and when the preset does not resolve", () => {
    const own = `${PAPER}/own.jsonc`;
    const porting = (ext: string) => ({
      cycles: [{ ...PORTING, venue: { kind: "preset", extends: ext } }],
    });
    expect(
      lint(OFFICIAL, porting("./own.jsonc"), {
        extra: {
          [own]: JSON.stringify({
            type: "family",
            tex: { packages: { x: ["x"] } },
          }),
        },
      }).filter((f) => f.rule === "cycle/port-done"),
    ).toEqual([]);
    expect(
      lint(OFFICIAL, porting("./missing.jsonc")).filter(
        (f) => f.rule === "cycle/port-done",
      ),
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

describe("tex/template under paperlint:msr-2027 — `[10pt,conference]`, without compsoc or compsocconf", () => {
  const MSR = { extends: "paperlint:msr-2027", kind: "technical" };

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

describe("tex/venue-leftover — FSE in related work is no leftover", () => {
  it("🔴 «FSE 2027» in another venue's paper warns; FSE papers cited by older years do not", () => {
    const leftover = (body: string) =>
      lint(aidcPaper(body + STATEMENT), AIDC)
        .filter((f) => f.rule === "tex/venue-leftover")
        .map((f) => f.messageId);
    expect(leftover("First written for FSE 2027.\n")).toEqual(["leftover"]);
    expect(leftover("As shown at ESEC/FSE 2023 and FSE 2024.\n")).toEqual([]);
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
          extends: "paperlint:aisec-2026",
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
          extends: "paperlint:aidc-2026",
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
  "\\institution{Presented at AISec 2026, co-located with ACM CCS 2026}";
const leftovers = (fs: readonly Finding[]) =>
  fs.filter((f) => f.rule === "tex/venue-leftover");

describe("tex/venue-leftover — another venue named in the text", () => {
  it("🔴 the author-block line fails under aidc: both names, on that line", () => {
    const tex = aidcPaper(`${INSTITUTION}\n${BODY}${STATEMENT}`);
    const fs = leftovers(lint(tex, AIDC));
    expect(fs.map((f) => f.message)).toEqual([
      "«AISec» names AISec 2026, and this paper extends AIDC 2026 — a leftover from an earlier submission? A reviewer reads it before the abstract. Comments and citation keys are not reported; a sentence that names the other venue on purpose can keep it with a disable directive",
      expect.stringContaining("«ACM CCS» names ACM CCS 2026"),
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
      leftovers(
        lint(tex, { extends: "paperlint:aisec-2026", kind: "research" }),
      ),
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
      `As shown~\\citep[presented at AISec 2026]{aisec2025}.\n${BODY}${STATEMENT}`,
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

describe("tex/venue-leftover — where a leftover is looked for (#552)", () => {
  const ACM = { extends: "paperlint:acm-sigconf", kind: "research" };
  const ASE_LINE =
    "\\acmConference[ASE '26]{Proceedings of the 41st IEEE/ACM International Conference on Automated Software Engineering}{October 12--16, 2026}{Munich, Germany}";
  const CITED =
    "\\section{Introduction}\nLam~et~al.\\ (\\emph{CodeCrash}, NeurIPS 2025) report a drop.\n\\section{Conclusion}\nText.\n";

  it("a family preset names no venue, so nothing is another venue: silent", () => {
    // Guards: an ASE paper on the generic ACM template was told its own \\acmConference is a leftover.
    const tex = paper(
      "\\documentclass[sigconf]{acmart}",
      `${ASE_LINE}\n${BODY}`,
    );
    expect(leftovers(lint(tex, ACM))).toEqual([]);
  });

  it("a venue named in the body after the first section is related work by default: silent", () => {
    // Guards: a CCS paper citing «(CodeCrash, NeurIPS 2025)» was told it is a leftover.
    expect(leftovers(lint(aidcPaper(`${CITED}${STATEMENT}`), AIDC))).toEqual(
      [],
    );
  });

  it("with `body: true` the body is read too, and the same citation is reported", () => {
    const fs = leftovers(
      lint(aidcPaper(`${CITED}${STATEMENT}`), AIDC, {
        options: [{ body: true }],
      }),
    );
    expect(fs.map((f) => f.line)).toEqual([5]);
  });

  it("the front matter is read whatever the option: the author block's leftover is still reported", () => {
    // Guards: narrowing the prose scan must not lose the leftover a reviewer reads before the abstract.
    expect(
      leftovers(
        lint(aidcPaper(`${INSTITUTION}\n${BODY}${STATEMENT}`), AIDC),
      ).map((f) => f.line),
    ).toEqual([4, 4]);
  });

  it("a venue command after the first section still counts: it states the paper's venue", () => {
    const tex = aidcPaper(
      `${BODY}\\acmConference[AISec '26]{AISec}{2026}{Salt Lake City}\n${STATEMENT}`,
    );
    expect(leftovers(lint(tex, AIDC)).length).toBeGreaterThan(0);
  });
});

describe("tex/venue-leftover — a workshop's parent conference (`parent`) is the paper's own", () => {
  const agenticdev = (text: string) =>
    paper("\\documentclass[sigconf]{acmart}", `${text}\nText.`);
  const AGENTICDEV = { extends: "paperlint:agenticdev-2026", kind: "full" };
  const named = (fs: readonly Finding[]) =>
    leftovers(fs).map((f) => /«(.*?)» names (.*?),/u.exec(f.message)?.slice(1));

  it("an AgenticDev paper may name ASE 2026, the conference it is held at: silent", () => {
    expect(
      leftovers(lint(agenticdev("A workshop of ASE 2026."), AGENTICDEV)),
    ).toEqual([]);
  });

  it("🔴 an AIDC paper naming ASE 2026 is reported once, as ASE", () => {
    const tex = aidcPaper(`Formerly at ASE 2026.\n${BODY}${STATEMENT}`);
    expect(named(lint(tex, AIDC))).toEqual([["ASE", "ASE 2026"]]);
  });

  it("🔴 an AIDC paper naming ACM CCS 2026 is reported once, as ACM CCS; an AISec paper is silent", () => {
    const text = "Co-located with ACM CCS 2026.";
    expect(
      named(lint(aidcPaper(`${text}\n${BODY}${STATEMENT}`), AIDC)),
    ).toEqual([["ACM CCS", "ACM CCS 2026"]]);
    expect(
      leftovers(
        lint(agenticdev(text), {
          extends: "paperlint:aisec-2026",
          kind: "research",
        }),
      ),
    ).toEqual([]);
  });

  it("🔴 FSE and ASE do not collide: an AgenticDev paper names ASE as its own and FSE 2027 as another venue; an FSE paper reports ASE", () => {
    expect(
      named(lint(agenticdev("At ASE 2026, after FSE 2027."), AGENTICDEV)),
    ).toEqual([["FSE", "FSE 2027"]]);
    expect(
      named(
        lint(
          paper(
            "\\documentclass[acmsmall]{acmart}",
            "Formerly at ASE 2026, now FSE 2027.\nText.",
          ),
          { extends: "paperlint:fse-2027", kind: "research" },
        ),
      ),
    ).toEqual([["ASE", "ASE 2026"]]);
  });

  it("the parent's names are the paper's own, not the workshop's: AgenticDev still reports AISec", () => {
    expect(
      named(lint(agenticdev("ASE 2026, after AISec 2026."), AGENTICDEV)),
    ).toEqual([["AISec", "AISec 2026"]]);
  });
});

describe("tex/venue-leftover — in prose, a name counts only beside a recent year", () => {
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
    ["a bare name", "Submitted to AISec, then to REALM."],
    [
      "related work: a year older than the paper's own minus one",
      "As shown at ICSE 2019, FSE'24 and AISec~2023.",
    ],
  ])("silent: %s", (_, text) => {
    expect(under(text)).toEqual([]);
  });

  it.each([
    ["First written for MSR 2027.", "MSR", "MSR 2027"],
    ["A version appeared as MSR'27 work.", "MSR", "MSR 2027"],
    ["Submitted to MSR~2027.", "MSR", "MSR 2027"],
    ["Submitted to AISec 2025.", "AISec", "AISec 2025"],
    ["Aimed at ICSE’28.", "ICSE", "ICSE 2028"],
  ])("🔴 reported: «%s»", (text, name, other) => {
    const fs = under(text);
    expect(fs.map((f) => f.message)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^«${name}» names ${other}, and this paper extends AIDC 2026`,
        ),
      ),
    ]);
    expect(fs[0]?.line).toBe(4);
  });
});

describe("tex/venue-leftover — the paper's own series, and its parent's, in another edition", () => {
  it("under msr itself, its own name with its own year is never a leftover", () => {
    const tex = paper(
      "\\documentclass[10pt,conference]{IEEEtran}",
      "First written for MSR 2027.",
    );
    expect(
      leftovers(
        lint(tex, { extends: "paperlint:msr-2027", kind: "technical" }),
      ),
    ).toEqual([]);
  });

  it("🔴 its own series in another recent edition is a leftover: «ICSE 2027» in an ICSE 2028 paper; «ICSE 2019» is not", () => {
    const icse = (text: string) =>
      leftovers(
        lint(paper("\\documentclass[sigconf]{acmart}", text), {
          extends: "paperlint:icse-2028",
          kind: "research",
        }),
      ).map((f) =>
        /«(.*?)» names (.*?), and this paper extends (.*?) —/u
          .exec(f.message)
          ?.slice(1),
      );
    expect(icse("First written for ICSE 2027.")).toEqual([
      ["ICSE", "ICSE 2027", "ICSE 2028"],
    ]);
    expect(icse("Submitted to ICSE 2028, after ICSE 2019.")).toEqual([]);
  });

  it("a workshop's parent of the same year is its own; another recent edition of the parent is not", () => {
    const nlbse = (text: string) =>
      leftovers(
        lint(paper("\\documentclass[conference]{IEEEtran}", text), {
          extends: "paperlint:nlbse-2027",
          kind: "full",
        }),
      ).map((f) => /«(.*?)» names (.*?),/u.exec(f.message)?.slice(1));
    expect(nlbse("An NLBSE workshop of ICSE 2027.")).toEqual([]);
    expect(nlbse("Rejected at ICSE 2028.")).toEqual([["ICSE", "ICSE 2028"]]);
  });
});

describe("tex/venue-leftover — inside a command that states the venue, any other venue's name counts", () => {
  const under = (line: string, settings: object = AIDC) =>
    leftovers(lint(aidcPaper(`${line}\n${BODY}${STATEMENT}`), settings)).map(
      (f) => /«(.*?)» names (.*?),/u.exec(f.message)?.slice(1),
    );

  it.each([
    [
      "\\acmConference[AISec]{AISec}{Nov 2026}{The Hague}",
      [
        ["AISec", "AISec"],
        ["AISec", "AISec"],
      ],
    ],
    ["\\acmBooktitle{Proceedings of ASE}", [["ASE", "ASE"]]],
    ["\\conferenceinfo{MSR}{Dublin}", [["MSR", "MSR"]]],
    ["\\IEEEpubid{978-1-2345 \\copyright 2019 IEEE S\\&P}", []],
    ["\\IEEEpubid{Accepted at REALM}", [["REALM", "REALM"]]],
    [
      "\\acmConference[ICSE '19]{ICSE}{2019}{x}",
      [
        ["ICSE", "ICSE 2019"],
        ["ICSE", "ICSE"],
      ],
    ],
  ])("🔴 %s", (line, want) => {
    expect(under(line)).toEqual(want);
  });

  it("the paper's own edition, and its parent, in the command: silent; its own name with another year: reported", () => {
    expect(
      under("\\acmConference[AIDC '26]{AIDC at ACSAC 2026}{x}{y}"),
    ).toEqual([]);
    expect(under("\\acmConference[AIDC '25]{AIDC}{x}{y}")).toEqual([
      ["AIDC", "AIDC 2025"],
    ]);
  });

  it("the same names in prose without a year, or in a comment: silent", () => {
    expect(
      under("Unlike AISec and ASE, and MSR.\n% \\acmConference{AISec}"),
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
        `\\newcommand{\\oldvenue}{AISec 2026}\n${use}${BODY}${STATEMENT}`,
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
    ["a footnote", "Text.\\footnote{Submitted to REALM 2026.}", ["REALM"]],
    ["a tie inside the name", "ACM~CCS~2026", ["ACM CCS"]],
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
        venuePreset("AIDC Next", {
          extends: "paperlint:aidc-2026",
          aliases: ["ACM CCS"],
        }),
      ),
    };
    const tex = aidcPaper(`ACM CCS 2026 and AIDC 2027.\n${BODY}${STATEMENT}`);
    expect(
      leftovers(
        lint(tex, { extends: "./own.jsonc", kind: "regular" }, { extra }),
      ),
    ).toEqual([]);
  });

  it("under a family, no venue is another venue: the family names none, so it is silent", () => {
    // Guards: «Accepted at AAAI 2026» on the generic AAAI template, and an ASE paper's own
    // \\acmConference on the generic ACM one, were reported as leftovers (#552). A family cannot
    // know which venue the paper is for, so it has nothing to compare a name with.
    const tex = paper(
      "\\documentclass[conference]{IEEEtran}",
      "Accepted at AIDC 2026. Formerly at AISec 2026.",
    );
    expect(
      leftovers(lint(tex, { extends: "paperlint:ieee-conference" })),
    ).toEqual([]);
  });
});

describe("the judges, on places the parser did not give", () => {
  const files = memoryFiles(shipped);
  const aidc = resolvePreset("paperlint:aidc-2026", `${PAPER}/paperlint.json`, {
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
        Object.entries(shipped).filter(
          ([f]) => !f.endsWith("realm-2026.jsonc"),
        ),
      ),
    );
    const deps = { files, venuesDir: VENUES };
    const from = `${PAPER}/paperlint.json`;
    const aidc = resolvePreset("paperlint:aidc-2026", from, deps);
    expect(aidc.ok).toBe(true);
    if (!aidc.ok) return;
    // aidc's own chain (AIDC over ieee-conference) and REALM, which does not resolve here, are left out.
    expect(otherVenues(aidc.value, deps).map((o) => [o.label, o.year])).toEqual(
      shippedVenuesExcept("AIDC", "ieee-conference", "REALM"),
    );
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
const NEURIPS = { extends: "paperlint:neurips-2026", kind: "main" };
const CHECKLIST =
  "\\section*{NeurIPS Paper Checklist}\n\\begin{enumerate}\\item x\\end{enumerate}\n";
/** A paper in the kit's template: article, the style loaded after it. */
const neuripsPaper = (body: string, preamble = "") =>
  paper(
    `\\documentclass{article}\n\\usepackage{neurips_2026}\n${preamble}`,
    body,
  );
const NEURIPS_BIB =
  "\\begin{thebibliography}{1}\\bibitem{a} A. Author. Learning.\\end{thebibliography}\n";

describe("tex/required-section — NeurIPS's paper checklist", () => {
  it.each<[string, string]>([
    [
      "after the references and the appendix, as the kit puts it",
      BODY + NEURIPS_BIB + APPENDIX + CHECKLIST,
    ],
    ["straight after the references", BODY + NEURIPS_BIB + CHECKLIST],
    [
      "before the references: the order is only suggested",
      BODY + CHECKLIST + NEURIPS_BIB,
    ],
  ])("passes %s", (_, body) => {
    expect(lint(neuripsPaper(body), NEURIPS)).toEqual([]);
  });

  it("passes from the kit's own \\input{checklist.tex}, as the build recorded it", () => {
    const tex = neuripsPaper(BODY + NEURIPS_BIB + "\\input{checklist.tex}\n");
    const extra = builtPaper(
      PAPER,
      { "paper.tex": tex, "checklist.tex": CHECKLIST },
      [
        { path: "paper.tex", role: "body" },
        { path: "neurips_2026.sty", role: "preamble" },
        { path: "checklist.tex", role: "body" },
      ],
    );
    expect(lint(tex, NEURIPS, { extra })).toEqual([]);
  });

  it.each<[string, string, number]>([
    ["🔴 no checklist at all — a desk reject", BODY + NEURIPS_BIB, 12],
    [
      "🔴 a heading other than the kit's",
      BODY + NEURIPS_BIB + "\\section*{Paper Checklist}\nx\n",
      14,
    ],
  ])("%s", (_, body, line) => {
    expect(required(lint(neuripsPaper(body), NEURIPS))).toEqual([
      {
        rule: "tex/required-section",
        messageId: "missing",
        message:
          "NeurIPS requires a section titled «NeurIPS Paper Checklist» and there is none — add `\\section*{NeurIPS Paper Checklist}` (the title exactly; a bold paragraph does not count)",
        line,
      },
    ]);
  });
});

/** A paper whose preamble is `preamble`, under the NeurIPS family's class. */
const articlePaper = (preamble: string, body = BODY + CHECKLIST) =>
  paper(`\\documentclass{article}\n${preamble}`, body);

describe("tex/template — a style file the template loads (`template_style`): what passes", () => {
  it.each<[string, string]>([
    ["the kit's own line", "\\usepackage{neurips_2026}"],
    [
      "with options of the paper's own",
      "\\usepackage[preprint,nonatbib]{neurips_2026}",
    ],
    ["in a list with other packages", "\\usepackage{amsmath,neurips_2026}"],
    ["as \\RequirePackage", "\\RequirePackage{neurips_2026}"],
    [
      "one of several lines behind a TeX switch",
      "\\if\\venue1 \\usepackage{iclr2027_conference} \\fi\n\\if\\venue2 \\usepackage{neurips_2026} \\fi",
    ],
  ])("%s", (_, preamble) => {
    expect(lint(articlePaper(preamble), NEURIPS)).toEqual([]);
  });

  it("from a preamble the paper \\inputs, as the build recorded it", () => {
    const tex = articlePaper("\\input{preamble}");
    const extra = builtPaper(
      PAPER,
      { "paper.tex": tex, "preamble.tex": "\\usepackage{neurips_2026}\n" },
      [
        { path: "paper.tex", role: "body" },
        { path: "preamble.tex", role: "preamble" },
      ],
    );
    expect(lint(tex, NEURIPS, { extra })).toEqual([]);
  });

  it("silent for a preset that names no style: a project's own article takes any package", () => {
    const own = `${PAPER}/own.jsonc`;
    expect(
      lint(
        paper(
          "\\documentclass[11pt]{article}\n\\usepackage{neurips_2026}",
          "Text.",
        ),
        { extends: "./own.jsonc" },
        {
          extra: {
            [own]: JSON.stringify({
              type: "family",
              template: "\\documentclass[11pt]{article}",
            }),
          },
        },
      ),
    ).toEqual([]);
  });
});

describe("tex/template — a style file the template loads (`template_style`): what fails", () => {
  const template = (tex: string) =>
    lint(tex, NEURIPS).filter((f) => f.rule === "tex/template");

  it("🔴 no style at all: the class alone does not pass", () => {
    expect(template(articlePaper("\\usepackage{amsmath}"))).toEqual([
      {
        rule: "tex/template",
        messageId: "missingStyle",
        message:
          "NeurIPS requires `\\usepackage{neurips_2026}`; paper.tex loads no such package — the page, the fonts and the margins the venue checks come from it",
        line: 1,
      },
    ]);
  });

  it("🔴 another year's NeurIPS style, at its line", () => {
    expect(template(articlePaper("\\usepackage{neurips_2025}"))).toEqual([
      {
        rule: "tex/template",
        messageId: "wrongStyle",
        message:
          "paper.tex loads `neurips_2025`, another venue's or another year's style; NeurIPS requires `\\usepackage{neurips_2026}`",
        line: 3,
      },
    ]);
  });

  it("🔴 a style commented out is not loaded", () => {
    expect(ids(template(articlePaper("% \\usepackage{neurips_2026}")))).toEqual(
      ["tex/template:missingStyle"],
    );
  });

  it("🔴 another class: the class finding alone (that class may load a style of its own)", () => {
    expect(
      ids(
        template(paper("\\documentclass[sigconf]{acmart}", BODY + CHECKLIST)),
      ),
    ).toEqual(["tex/template:wrongClass"]);
  });
});

describe("otherStyles — the styles of the shipped venues off a paper's chain", () => {
  const files = memoryFiles(shipped);
  const deps = { files, ...READERS };
  const from = `${PAPER}/paperlint.json`;

  it("names the other families' styles, not the paper's own; a style the reader cannot read is left out", () => {
    const neurips = resolvePreset("paperlint:neurips-2026", from, deps);
    expect(neurips.ok).toBe(true);
    if (!neurips.ok) return;
    const names = otherStyles(neurips.value, deps);
    expect(names).toEqual(expect.arrayContaining(["icml2027", "aaai2027"]));
    expect(names).not.toContain("neurips_2026");
    const unreadable = {
      ...deps,
      latex: { ...latexReader, templateStyle: () => null },
    };
    expect(otherStyles(neurips.value, unreadable)).toEqual([]);
  });
});

const AAAI_MAIN = { extends: "paperlint:aaai-2027", kind: "main" };
/** tex/template on a paper under aaai-2027: its class line, then `preamble`. */
const template = (
  preamble: string,
  cls = "\\documentclass[letterpaper]{article}",
) =>
  lint(paper(`${cls}\n${preamble}`, "Text."), AAAI_MAIN).filter(
    (f) => f.rule === "tex/template",
  );

describe("tex/template under AAAI — a required style option passed with `\\PassOptionsToPackage`", () => {
  it("🔴 passed before the load, alone or in a list of packages: the option is in effect", () => {
    expect(
      template(
        "\\PassOptionsToPackage{submission}{aaai2027}\n\\usepackage{aaai2027}",
      ),
    ).toEqual([]);
    expect(
      template(
        "\\PassOptionsToPackage{submission}{times,aaai2027}\n\\usepackage{aaai2027}",
      ),
    ).toEqual([]);
  });
});

describe("tex/template under AAAI — the options LaTeX hands the style: global ones, a macro's, not the class's alone", () => {
  it("🔴 a global option of the class line reaches the style: aaai2027.sty declares and processes it", () => {
    expect(
      template(
        "\\usepackage{aaai2027}",
        "\\documentclass[letterpaper,submission]{article}",
      ),
    ).toEqual([]);
    expect(
      template(
        "\\documentclass[letterpaper,submission]{article}\n\\RequirePackageWithOptions{aaai2027}",
        "",
      ),
    ).toEqual([]);
  });

  it("🔴 an option built by a macro may carry it: silent, and the port is not called done", () => {
    expect(
      template(
        "\\usepackage{aaai2027}",
        "\\documentclass[letterpaper,\\opts]{article}",
      ),
    ).toEqual([]);
    const porting = {
      cycles: [
        {
          ...PORTING,
          id: "aaai-2027",
          venue: { kind: "preset", extends: "paperlint:aaai-2027" },
          kind: "main",
        },
      ],
    };
    const portDone = (cls: string) =>
      lint(paper(`${cls}\n\\usepackage{aaai2027}`, "Text."), porting).map(
        (f) => `${f.rule}:${f.messageId}`,
      );
    expect(portDone("\\documentclass[letterpaper,\\opts]{article}")).toEqual(
      [],
    );
    expect(
      portDone("\\documentclass[letterpaper,submission]{article}"),
    ).toEqual(["cycle/port-done:done"]);
  });
});

describe("tex/template under AAAI — a style loaded from a folder", () => {
  it("🔴 \\usepackage{sty/aaai2027} loads the package aaai2027: LaTeX names it by its file's base name", () => {
    expect(template("\\usepackage[submission]{sty/aaai2027}")).toEqual([]);
    expect(
      template("\\usepackage{sty/aaai2026}").map((f) => f.messageId),
    ).toEqual(["wrongStyle"]);
  });
});

describe("tex/template under AAAI — the options that do not reach the style", () => {
  it("🔴 passed to the class only: \\PassOptionsToClass does not make an option global", () => {
    expect(
      template(
        "\\usepackage{aaai2027}",
        "\\PassOptionsToClass{submission}{article}\n\\documentclass[letterpaper]{article}",
      ).map((f) => f.messageId),
    ).toEqual(["missingStyleOption"]);
  });

  it("🔴 passed after the load, or to another package: the option is missing", () => {
    for (const preamble of [
      "\\usepackage{aaai2027}\n\\PassOptionsToPackage{submission}{aaai2027}",
      "\\PassOptionsToPackage{submission}{times}\n\\usepackage{aaai2027}",
    ])
      expect(template(preamble).map((f) => f.messageId)).toEqual([
        "missingStyleOption",
      ]);
  });
});

const neurips = resolvePreset(
  "paperlint:neurips-2026",
  `${PAPER}/paperlint.json`,
  { files: memoryFiles(shipped), venuesDir: VENUES },
);
const at = (start: number) => ({
  kind: "at" as const,
  span: { start, end: start + 1 },
});

describe("judgeStyle — another shipped venue's style, and a required option", () => {
  it("🔴 a style another shipped venue names is reported by name; an unknown package is the paper's own", () => {
    expect(neurips.ok).toBe(true);
    if (!neurips.ok) return;
    const judge = (name: string) =>
      judgeStyle(
        {
          packages: [{ name, options: [], unread: [], place: at(5) }],
          others: ["icml2027", "aaai2027"],
          unseen: false,
        },
        neurips.value,
        latexReader,
      ).map((f) => [f.messageId, f.data["got"] ?? ""]);
    expect(judge("icml2027")).toEqual([["wrongStyle", "icml2027"]]);
    expect(judge("aaai2027")).toEqual([["wrongStyle", "aaai2027"]]);
    expect(judge("iclr2027_conference")).toEqual([["missingStyle", ""]]);
  });

  it("🔴 a required option missing is one finding per option, at the line; with it, silent", () => {
    expect(neurips.ok).toBe(true);
    if (!neurips.ok) return;
    const withOption = {
      ...neurips.value,
      templateStyle: { text: "\\usepackage[main]{neurips_2026}", file: "x" },
    };
    const judge = (options: readonly string[]) =>
      judgeStyle(
        {
          packages: [
            { name: "neurips_2026", options, unread: [], place: at(5) },
          ],
          others: [],
          unseen: false,
        },
        withOption,
        latexReader,
      ).map((f) => [f.messageId, f.data["option"] ?? ""]);
    expect(judge([])).toEqual([["missingStyleOption", "main"]]);
    expect(judge(["main", "final"])).toEqual([]);
  });
});

/** tex/template and cycle/port-done findings on a NeurIPS paper. */
const styleFindings = (tex: string, settings: object = NEURIPS) =>
  lint(tex, settings)
    .filter((f) => f.rule === "tex/template" || f.rule === "cycle/port-done")
    .map((f) => `${f.rule}:${f.messageId}`);
const NEURIPS_PORT = {
  cycles: [
    {
      ...PORTING,
      id: "neurips-2026",
      venue: { kind: "preset", extends: "paperlint:neurips-2026" },
      kind: "main",
    },
  ],
};

describe("the style check stays silent where the reader cannot see the style", () => {
  it.each<[string, string]>([
    ["🔴 an \\input preamble with no build record yet", "\\input{preamble}"],
    ["🔴 the style's name built by a macro", "\\usepackage{\\venuestyle}"],
    [
      "🔴 the name expanded from a macro",
      "\\expandafter\\usepackage\\expandafter{\\venuestyle}",
    ],
    [
      "🔴 the load inside a macro the preamble calls",
      "\\newcommand{\\loadstyle}{\\usepackage{neurips_2026}}\n\\loadstyle",
    ],
    [
      "🔴 the name in another case (a case-insensitive file system loads it)",
      "\\usepackage{NeurIPS_2026}",
    ],
    [
      "🔴 another year's style beside an unread \\input that may load this one",
      "\\usepackage{neurips_2025}\n\\input{preamble}",
    ],
  ])(
    "%s: no tex/template finding, and the port is not called done",
    (_, preamble) => {
      const tex = paper(`\\documentclass{article}\n${preamble}`, "Text.");
      expect(styleFindings(tex)).toEqual([]);
      expect(styleFindings(tex, NEURIPS_PORT)).toEqual([]);
    },
  );
});

describe("the style check over what the reader reads but TeX may not run", () => {
  it("🔴 the class line itself in an unread file: neither class nor style is judged", () => {
    expect(styleFindings(paper("\\input{header}", "Text."))).toEqual([]);
  });

  it("a load behind a TeX switch counts as a load: which branch builds is not evaluated", () => {
    const tex = paper(
      "\\documentclass{article}\n\\ifdefined\\final\\usepackage[final]{neurips_2026}\\else\\usepackage{neurips_2026}\\fi",
      "Text.",
    );
    expect(styleFindings(tex)).toEqual([]);
  });
});

describe("the style check reads what TeX reads: nothing after \\end{document}", () => {
  const parked = (preamble: string, after: string) =>
    `${paper(`\\documentclass{article}\n${preamble}`, "Text.")}${after}\n`;

  it("🔴 a load parked after \\end{document} is no load: missingStyle, and the port is not done", () => {
    const tex = parked("", "\\usepackage{neurips_2026}");
    expect(styleFindings(tex)).toEqual(["tex/template:missingStyle"]);
    expect(styleFindings(tex, NEURIPS_PORT)).not.toContain(
      "cycle/port-done:done",
    );
  });

  it("🔴 options passed and the style loaded again after \\end{document} do not count: missingStyleOption", () => {
    const tex = `${paper("\\documentclass[letterpaper]{article}\n\\usepackage{aaai2027}", "Text.")}\\PassOptionsToPackage{submission}{aaai2027}\n\\usepackage[submission]{aaai2027}\n`;
    expect(
      lint(tex, AAAI_MAIN)
        .filter((f) => f.rule === "tex/template")
        .map((f) => f.messageId),
    ).toEqual(["missingStyleOption"]);
  });

  it("🔴 a load inside a macro after \\end{document} hides nothing: missingStyle", () => {
    const tex = parked(
      "",
      "\\newcommand{\\loadstyle}{\\usepackage{neurips_2026}}",
    );
    expect(styleFindings(tex)).toEqual(["tex/template:missingStyle"]);
  });

  it("a load before \\end{document} still counts, with text after it: no finding, and the port is done", () => {
    const tex = parked("\\usepackage{neurips_2026}", "% notes");
    expect(styleFindings(tex)).toEqual([]);
    expect(styleFindings(tex, NEURIPS_PORT)).toEqual(["cycle/port-done:done"]);
  });
});

describe("the style check still speaks where the reader sees the whole preamble", () => {
  it.each<[string, string, string]>([
    [
      "🔴 a load behind \\iffalse is no load",
      "\\iffalse\n\\usepackage{neurips_2026}\n\\fi",
      "missingStyle",
    ],
    ["🔴 an \\input only in the body hides nothing", "", "missingStyle"],
    [
      "🔴 another year's style with no include",
      "\\usepackage{neurips_2025}",
      "wrongStyle",
    ],
  ])("%s", (_, preamble, messageId) => {
    const tex = paper(
      `\\documentclass{article}\n${preamble}`,
      "\\input{intro}\nText.",
    );
    expect(styleFindings(tex)).toEqual([`tex/template:${messageId}`]);
  });
});

describe("judgeStyle — a template_style the reader cannot read", () => {
  it("a template_style that is not one \\usepackage line is said, naming the file", () => {
    expect(neurips.ok).toBe(true);
    if (!neurips.ok) return;
    const odd = {
      ...neurips.value,
      templateStyle: { text: "\\usepackage{a,b}", file: "odd.jsonc" },
    };
    expect(
      judgeStyle(
        { packages: [], others: [], unseen: false },
        odd,
        latexReader,
      ).map((f) => f.messageId),
    ).toEqual(["badStyle"]);
  });
});

describe("format/layout-override and cycle/port-done under the NeurIPS style", () => {
  it("🔴 layout-override reports a \\newgeometry and a margin option; silent on the kit's preamble", () => {
    const overrides = (preamble: string, body = BODY + CHECKLIST) =>
      lint(articlePaper(preamble, body), NEURIPS)
        .filter((f) => f.rule === "format/layout-override")
        .map((f) => f.line);
    expect(
      overrides(
        "\\usepackage{neurips_2026}",
        "\\newgeometry{textwidth=6.5in}\n" + BODY + CHECKLIST,
      ),
    ).toEqual([5]);
    expect(
      overrides(
        "\\usepackage{neurips_2026}\n\\usepackage[margin=0.5in]{geometry}",
      ),
    ).toEqual([4]);
    expect(overrides("\\usepackage{neurips_2026}")).toEqual([]);
  });

  const porting = {
    cycles: [
      {
        ...PORTING,
        id: "neurips-2026",
        venue: { kind: "preset", extends: "paperlint:neurips-2026" },
        kind: "main",
      },
    ],
  };

  it("🔴 port-done: a port from another article-based style is not done while its style stays; done once the style is NeurIPS's", () => {
    const portDone = (preamble: string) =>
      lint(articlePaper(preamble, "Text."), porting).map(
        (f) => `${f.rule}:${f.messageId}`,
      );
    expect(portDone("\\usepackage{iclr2027_conference}")).toEqual([]);
    expect(portDone("\\usepackage{neurips_2026}")).toEqual([
      "cycle/port-done:done",
    ]);
  });
});

describe("tex/venue-leftover — NeurIPS counts only beside a recent year", () => {
  const under = (text: string) =>
    leftovers(lint(aidcPaper(`${text}\n${BODY}${STATEMENT}`), AIDC));

  it.each([
    ["the venue named alone", "Benchmarks popular at NeurIPS are larger."],
    [
      "related work: an edition older than the paper's own year minus one",
      "As shown at NeurIPS 2023, the bound is tight.",
    ],
  ])("silent: %s", (_, text) => {
    expect(under(text)).toEqual([]);
  });

  it.each([
    ["First written for NeurIPS 2026."],
    ["A version appeared as NeurIPS'26 work."],
    ["Submitted to NeurIPS~2026."],
  ])("🔴 reported: «%s»", (text) => {
    expect(under(text).map((f) => f.message)).toEqual([
      expect.stringMatching(
        /^«NeurIPS» names NeurIPS 2026, and this paper extends AIDC 2026/,
      ),
    ]);
  });

  it("under neurips itself, its own name with a year is never a leftover", () => {
    expect(
      leftovers(
        lint(neuripsPaper(`For NeurIPS 2026.\n${BODY}${CHECKLIST}`), NEURIPS),
      ),
    ).toEqual([]);
  });
});

const AAAI = { extends: "paperlint:aaai-2027", kind: "main" };
/** A paper in the AAAI-27 kit's template: its two lines, as the kit writes them. */
const aaaiPaper = (
  body: string,
  style = "\\usepackage[submission]{aaai2027}",
) => paper(`\\documentclass[letterpaper]{article}\n${style}`, body);

describe("tex/venue-leftover — AAAI counts only beside a recent year", () => {
  const under = (text: string) =>
    leftovers(lint(aidcPaper(`${text}\n${BODY}${STATEMENT}`), AIDC));

  it.each([
    ["the venue named alone", "Planners popular at AAAI are larger."],
    ["its press", "The AAAI Press style sets two columns."],
    // 🔴 The call's own spelling is not reached: a hyphen is not a year beside the name (aaai-2027.md).
    ["the call's spelling, with a hyphen", "First written for AAAI-27."],
    [
      "related work: an edition older than the paper's own year minus one",
      "As shown at AAAI 2024, the bound is tight.",
    ],
  ])("silent: %s", (_, text) => {
    expect(under(text)).toEqual([]);
  });

  it.each([
    ["First written for AAAI 2027."],
    ["A version appeared as AAAI'27 work."],
    ["Submitted to AAAI~2027."],
  ])("🔴 reported: «%s»", (text) => {
    expect(under(text).map((f) => f.message)).toEqual([
      expect.stringMatching(
        /^«AAAI» names AAAI 2027, and this paper extends AIDC 2026/,
      ),
    ]);
  });

  it("under aaai-2027 itself, its own name with a year is never a leftover", () => {
    expect(leftovers(lint(aaaiPaper(`For AAAI 2027.\n${BODY}`), AAAI))).toEqual(
      [],
    );
  });
});

const ICML = { extends: "paperlint:icml-2027", kind: "main" };
const IMPACT = "\\section*{Impact Statement}\nThis paper advances the field.\n";
const ACK = "\\section*{Acknowledgements}\nThanks.\n";
/** A paper in the kit's template: article, the style loaded after it. */
const icmlPaper = (body: string, preamble = "") =>
  paper(`\\documentclass{article}\n\\usepackage{icml2027}\n${preamble}`, body);
const ICML_BIB =
  "\\begin{thebibliography}{1}\\bibitem{a} A. Author. Learning.\\end{thebibliography}\n";

describe("tex/required-section — ICML's impact statement", () => {
  it.each<[string, string]>([
    [
      "before the acknowledgements and the references, as the kit puts it",
      BODY + IMPACT + ACK + ICML_BIB + APPENDIX,
    ],
    [
      "after the acknowledgements: «the two may appear in either order»",
      BODY + ACK + IMPACT + ICML_BIB,
    ],
  ])("passes %s", (_, body) => {
    expect(lint(icmlPaper(body), ICML)).toEqual([]);
  });

  it.each<[string, string, number]>([
    ["🔴 no impact statement at all", BODY + ICML_BIB, 12],
    [
      "🔴 a heading other than the kit's",
      BODY + "\\section*{Broader Impact}\nx\n" + ICML_BIB,
      14,
    ],
  ])("%s", (_, body, line) => {
    expect(required(lint(icmlPaper(body), ICML))).toEqual([
      {
        rule: "tex/required-section",
        messageId: "missing",
        message:
          "ICML requires a section titled «Impact Statement» and there is none — add `\\section*{Impact Statement}` (the title exactly; a bold paragraph does not count)",
        line,
      },
    ]);
  });

  it("the AI Disclosure Statement, required by the call under no fixed title, is not checked", () => {
    expect(
      lint(icmlPaper(BODY + IMPACT + ICML_BIB), ICML).filter(
        (f) => f.rule === "tex/required-section",
      ),
    ).toEqual([]);
  });
});

describe("the ICML style under tex/template, format/layout-override and cycle/port-done", () => {
  const found = (tex: string, settings: object = ICML) =>
    lint(tex, settings).map((f) => `${f.rule}:${f.messageId}`);

  it("the kit's two lines pass; an option of the paper's own too", () => {
    expect(found(icmlPaper(BODY + IMPACT))).toEqual([]);
    expect(
      found(
        paper(
          "\\documentclass{article}\n\\usepackage[accepted]{icml2027}",
          BODY + IMPACT,
        ),
      ),
    ).toEqual([]);
  });

  it("🔴 another class, a margin, another venue's style, another ICML edition's: each reported", () => {
    expect(
      found(paper("\\documentclass[sigconf]{acmart}", BODY + IMPACT)),
    ).toEqual(["tex/template:wrongClass"]);
    expect(
      found(icmlPaper(BODY + IMPACT, "\\usepackage[margin=0.6in]{geometry}")),
    ).toEqual(["format/layout-override:override"]);
    expect(
      found(
        paper(
          "\\documentclass{article}\n\\usepackage{neurips_2025}",
          BODY + IMPACT,
        ),
      ),
    ).toEqual(["tex/template:missingStyle"]);
    expect(
      found(
        paper(
          "\\documentclass{article}\n\\usepackage{neurips_2026}",
          BODY + IMPACT,
        ),
      ),
    ).toEqual(["tex/template:wrongStyle"]);
    expect(
      found(
        paper(
          "\\documentclass{article}\n\\usepackage{icml2026}",
          BODY + IMPACT,
        ),
      ),
    ).toEqual(["tex/template:wrongStyle"]);
  });
});

describe("tex/venue-leftover — ICML counts only beside a recent year", () => {
  const under = (text: string) =>
    leftovers(lint(aidcPaper(`${text}\n${BODY}${STATEMENT}`), AIDC));

  it.each([
    ["the venue named alone", "Benchmarks popular at ICML are smaller."],
    // Measured in a NeurIPS 2025 paper's prose: a citation tag glued to its year is no whole word.
    ["a tag glued to its year", "ELLM(ICML23) uses an LLM as a planner."],
    [
      "related work: an edition older than the paper's own year minus one",
      "As shown at ICML 2023, the bound is tight.",
    ],
  ])("silent: %s", (_, text) => {
    expect(under(text)).toEqual([]);
  });

  it.each([
    ["First written for ICML 2027."],
    ["A version appeared as ICML'27 work."],
    ["Submitted to ICML~2027."],
  ])("🔴 reported: «%s»", (text) => {
    expect(under(text).map((f) => f.message)).toEqual([
      expect.stringMatching(
        /^«ICML» names ICML 2027, and this paper extends AIDC 2026/,
      ),
    ]);
  });

  it("under icml-2027 itself, its own name with a year is never a leftover", () => {
    expect(
      leftovers(lint(icmlPaper(`For ICML 2027.\n${BODY}${IMPACT}`), ICML)),
    ).toEqual([]);
  });
});

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
