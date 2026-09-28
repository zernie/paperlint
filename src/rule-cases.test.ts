/**
 * Every rule paperlint registers runs through REAL ESLint, the way `paperlint lint` runs it: a small
 * paper tree in a temp directory, `run(["lint", "--json"])` — the CLI's own config, the `tex/latex`
 * language and its `raw`, the `root` visitors, `loc`, message templating, the `files` wiring. The
 * unit tests beside each rule call its `create` directly and cannot see that boundary; the TeX e2e
 * sees it only for the papers a real pdflatex can build.
 *
 * The rule set is read off the registry (`rulePlugins`, as `rule-docs.test.ts` does). Every rule
 * needs a case that REPORTS (its id, severity and line) and one that stays SILENT, or an entry in
 * `EXEMPT` with the reason; a case for a rule that is not registered fails too. A `_build/` file a
 * rule reads is planted as the build would write it — no pdflatex, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run, rulePlugins } from "./cli.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { bibHash } from "./references.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = (p: string): string =>
  readFileSync(join(ROOT, "fixtures", p), "utf8");

const P = "papers/p";
const STATUS = "---\nstages: []\n---\n# PIPELINE-STATUS\n";
const tex = (body: string, cls = "\\documentclass{article}"): string =>
  `${cls}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** A paper: its scorecard and paper.tex, and whatever else the case adds. */
const paper = (
  paperTex: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  [`${P}/PIPELINE-STATUS.md`]: STATUS,
  [`${P}/paper.tex`]: paperTex,
  ...extra,
});

// ── the venue rules' inputs: a PDF and the facts `paperlint build` would write about it ─────────

const PDF = "%PDF-1.5 a stand-in for the built PDF";
const AGENTICDEV = { extends: "paperlint:agenticdev", kind: "short" };
const ACM_TEX = tex("Text.", "\\documentclass[sigconf]{acmart}");

/** The facts of a short agenticdev paper that meets every number in its preset. */
const goodFacts = (): Record<string, unknown> => ({
  schema: 2,
  pdf: "paper.pdf",
  pdf_sha256: sha256Hex(new TextEncoder().encode(PDF)),
  venue: "agenticdev",
  kind: "short",
  npages: 7,
  fonts_source: "pdfjs-drawn",
  fonts: ["LinLibertineT", "LinBiolinumTB"].map((name) => ({
    name,
    type: "Type 1",
    embedded: true,
    program: "Type1",
  })),
  last_page: { kind: "measured", columns_pt: [600, 590] },
  last_page_cols_pt: [600, 590],
  geometry_source: "banal",
  page_w_in: 8.5,
  page_h_in: 11,
  columns: 2,
  body_pt: 9.3,
  ref_pt: 7.3,
  body_pages: 5,
  ref_pages: 2,
  appendix_pages: 0,
  pages_by_type: { body: 5, bib: 2 },
});

/** An agenticdev paper, built: its settings, the PDF, and facts with `patch` applied. */
const built = (
  patch: Record<string, unknown> = {},
  settings: Record<string, unknown> = AGENTICDEV,
): Record<string, string> =>
  paper(ACM_TEX, {
    [`${P}/paperlint.json`]: JSON.stringify(settings),
    [`${P}/paper.pdf`]: PDF,
    [`${P}/_build/paper.facts.json`]: JSON.stringify({
      ...goodFacts(),
      ...patch,
    }),
  });

// ── the reference rules' input: refs.bib, and the verdicts `paperlint build` would record ───────

const BIB =
  "@article{a,\n  title = {A},\n  author = {Doe, J.},\n  year = {2026},\n  doi = {10.1/x}\n}\n";
const sha = bibHash({ source: "refs.bib", text: BIB, offset: 0 });
/** A paper citing refs.bib, with its references record (`status`, `entries`) or none. */
const cited = (
  body: Record<string, unknown> | null,
  bibSha = sha,
): Record<string, string> =>
  paper(tex("See~\\cite{a}.\n\\bibliography{refs}"), {
    [`${P}/refs.bib`]: BIB,
    ...(body === null
      ? {}
      : {
          [`${P}/_build/references.json`]: JSON.stringify({
            schema: 1,
            bib: { source: "refs.bib", sha256: bibSha },
            ...body,
          }),
        }),
  });
/** A paper whose bibliography is written inline, by `filecontents*`, as `bib/reachable-entry` reads it. */
const inlineBib = (entry: string): string =>
  `\\documentclass{article}\n\\begin{filecontents*}{refs.bib}\n${entry}\n\\end{filecontents*}\n\\begin{document}\nSee~\\cite{a}.\n\\bibliography{refs}\n\\end{document}\n`;
const checked = (exists: string, authors: string) => ({
  status: "checked",
  entries: [{ key: "a", exists, authors }],
});

// ── an AIDC paper, for the LaTeX venue rules ──────────────────────────────────────────────────

const AIDC = {
  [`${P}/paperlint.json`]: JSON.stringify({
    extends: "paperlint:aidc",
    kind: "short",
  }),
};
const IEEE = "\\documentclass[conference,compsoc]{IEEEtran}";
const STATEMENT = "\\section*{LLM Usage Statement}\nNone.";
const aidc = (body: string, cls = IEEE) =>
  paper(tex(`\\section{Introduction}\n${body}\n${STATEMENT}`, cls), AIDC);

// ── the case table ─────────────────────────────────────────────────────────────────────────────

interface Reports {
  readonly tree: Record<string, string>;
  /** The file the finding is on, relative to the project. */
  readonly file: string;
  readonly severity: 1 | 2;
  readonly line: number;
}
interface RuleCases {
  readonly reports: Reports;
  /** A tree on which the rule says nothing, on any file. */
  readonly silent: Record<string, string>;
}

const TEX_FILE = `${P}/paper.tex`;
const STATUS_FILE = `${P}/PIPELINE-STATUS.md`;
const SHIPPED_STATUS =
  "---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/a.pdf\n    bytes: 1\n---\n# PIPELINE-STATUS\n";
const onPdf = (tree: Record<string, string>, line = 1) => ({
  tree,
  file: TEX_FILE,
  severity: 2 as const,
  line,
});

const CASES: Readonly<Record<string, RuleCases>> = {
  "paper/stages": {
    reports: {
      tree: { ...paper(tex("x")), [STATUS_FILE]: SHIPPED_STATUS },
      file: STATUS_FILE,
      severity: 2,
      line: 1,
    },
    silent: paper(tex("x")),
  },
  "paper/source": {
    reports: {
      tree: { ...paper(tex("x")), [STATUS_FILE]: SHIPPED_STATUS },
      file: STATUS_FILE,
      severity: 2,
      line: 1,
    },
    silent: paper(tex("x")),
  },
  "paper/research-question": {
    reports: {
      tree: {
        [STATUS_FILE]: fixture(
          "paper-research-question/shipped-no-rq/PIPELINE-STATUS.md",
        ),
        [TEX_FILE]: fixture("paper-research-question/shipped-no-rq/paper.tex"),
      },
      file: TEX_FILE,
      severity: 1,
      line: 1,
    },
    silent: {
      [STATUS_FILE]: fixture(
        "paper-research-question/shipped-with-rq/PIPELINE-STATUS.md",
      ),
      [TEX_FILE]: fixture("paper-research-question/shipped-with-rq/paper.tex"),
    },
  },
  "paper/section-word": {
    reports: {
      tree: paper(tex("As in §2.")),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    // A cleveref name definition sets a label, it is not prose.
    silent: paper(
      tex(
        "As in Section~2.",
        "\\documentclass{article}\n\\usepackage{cleveref}\n\\crefname{section}{§}{§§}",
      ),
    ),
  },
  "paper/leading-zero": {
    reports: {
      tree: paper(tex("We found $p < .05$.")),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: paper(tex("We found $p < 0.05$.")),
  },
  "paper/figure-ref-style": {
    reports: {
      tree: paper(tex("Fig.~\\ref{f1} and Figure~\\ref{f2}.")),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: paper(tex("Figure~\\ref{f1} and Figure~\\ref{f2}.")),
  },
  "paper/author-list": {
    reports: {
      tree: cited(checked("true", "mismatch")),
      file: TEX_FILE,
      severity: 2,
      line: 1,
    },
    silent: cited(checked("true", "match")),
  },
  "paper/cite-exists": {
    reports: {
      tree: cited(checked("false", "match")),
      file: TEX_FILE,
      severity: 2,
      line: 1,
    },
    silent: cited(checked("true", "match")),
  },
  "paper/refs-checked": {
    reports: { tree: cited(null), file: TEX_FILE, severity: 1, line: 1 },
    silent: cited(checked("true", "match")),
  },
  "paper/refs-fresh": {
    reports: {
      tree: cited(checked("true", "match"), "0".repeat(64)),
      file: TEX_FILE,
      severity: 2,
      line: 1,
    },
    silent: cited(checked("true", "match")),
  },
  "review/frontmatter": {
    reports: {
      tree: paper(tex("x"), {
        [`${P}/reviews/r1.md`]:
          "---\nfindings:\n  - id: 1\n    status: open\n---\n# Review\n",
      }),
      file: `${P}/reviews/r1.md`,
      severity: 2,
      line: 1,
    },
    silent: paper(tex("x"), {
      [`${P}/reviews/r1.md`]:
        "---\nfindings:\n  - id: 1\n    status: fixed\n---\n# Review\n",
    }),
  },
  "sibling/frontmatter": {
    reports: {
      tree: paper(tex("x"), {
        [`${P}/siblings/s.md`]: "---\nread: skimmed\n---\n# A sibling\n",
      }),
      file: `${P}/siblings/s.md`,
      severity: 1,
      line: 1,
    },
    silent: paper(tex("x"), {
      [`${P}/siblings/s.md`]: "---\nread: full\n---\n# A sibling\n",
    }),
  },
  "tex/future-promise": {
    reports: {
      tree: paper(fixture("tex-build/defect.tex")),
      file: TEX_FILE,
      severity: 1,
      line: 15,
    },
    silent: paper(fixture("tex-build/clean.tex")),
  },
  "tex/acm-frontmatter-override": {
    reports: {
      tree: paper(fixture("tex-build/frontmatter-defect.tex")),
      file: TEX_FILE,
      severity: 2,
      line: 10,
    },
    silent: paper(fixture("tex-build/frontmatter-clean.tex")),
  },
  "tex/template": {
    reports: {
      tree: aidc("Text.", "\\documentclass[conference]{IEEEtran}"),
      file: TEX_FILE,
      severity: 2,
      line: 1,
    },
    silent: aidc("Text."),
  },
  "tex/required-section": {
    reports: {
      tree: paper(tex("\\section{Introduction}\nText.", IEEE), AIDC),
      file: TEX_FILE,
      severity: 2,
      line: 5,
    },
    silent: aidc("Text."),
  },
  "tex/venue-leftover": {
    reports: {
      tree: aidc("First written for AISec."),
      file: TEX_FILE,
      severity: 1,
      line: 4,
    },
    silent: aidc("Text."),
  },
  "tex/claim-provenance": {
    reports: {
      tree: paper(tex("Text.\nAgents ignore 42\\% of the rules.")),
      file: TEX_FILE,
      severity: 1,
      line: 4,
    },
    silent: paper(
      tex(
        "Text.\nWe measured that agents ignore 42\\% of the rules.\nThey run on Claude 3 and Python 3.12.",
      ),
    ),
  },
  "bib/reachable-entry": {
    reports: {
      tree: paper(inlineBib("@book{a,\n  title = {A},\n  year = {2026}\n}")),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: paper(inlineBib(BIB)),
  },
  "pdf/fresh": {
    reports: onPdf(built({ pdf_sha256: "0".repeat(64) })),
    silent: built(),
  },
  "pdf/profile": {
    reports: onPdf(built({}, { extends: "paperlint:nope" })),
    silent: built(),
  },
  "pdf/measured": {
    reports: { ...onPdf(built({}, { kind: "short" })), severity: 1 },
    silent: built(),
  },
  "pdf/fonts": {
    reports: onPdf(
      built({
        fonts: [
          { name: "CMR10", type: "Type 1", embedded: true, program: "Type1" },
        ],
      }),
    ),
    silent: built(),
  },
  "pdf/geometry": {
    reports: onPdf(built({ page_w_in: 8.264 })),
    silent: built(),
  },
  "pdf/limits": {
    reports: onPdf(
      built({ body_pages: 9, pages_by_type: { body: 9, bib: 2 } }),
    ),
    silent: built(),
  },
  "pdf/body-size": {
    reports: { ...onPdf(built({ body_pt: 12 })), severity: 1 },
    silent: built(),
  },
  "pdf/last-page-balance": {
    reports: onPdf(
      built(
        { last_page: { kind: "measured", columns_pt: [621.5, 264.8] } },
        { ...AGENTICDEV, rules: { "pdf/last-page-balance": "error" } },
      ),
    ),
    silent: built(
      {},
      { ...AGENTICDEV, rules: { "pdf/last-page-balance": "error" } },
    ),
  },
};

/**
 * Rules whose honest case needs what this test cannot give, each with the reason. Checked against
 * the registry like the cases are: an entry for a rule that no longer exists fails.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

// ── the run ─────────────────────────────────────────────────────────────────────────────────────

const LintResults = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);
type Message = z.infer<typeof LintResults>[number]["messages"][number] & {
  readonly file: string;
};

/** `paperlint lint --json` over the tree, in-process through the CLI: every message, by file. */
async function lintTree(tree: Record<string, string>): Promise<Message[]> {
  const dir = writeTree(useTempDir("paperlint-rule-cases-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  return LintResults.parse(JSON.parse(out.join("\n"))).flatMap((r) =>
    r.messages.map((m) => ({ ...m, file: r.filePath.slice(dir.length + 1) })),
  );
}

/** Every rule id the registry holds. */
const registered = Object.entries(rulePlugins()).flatMap(([plugin, p]) =>
  Object.keys(p.rules ?? {}).map((rule) => `${plugin}/${rule}`),
);

describe("every registered rule has cases, and every case names a registered rule", () => {
  it.each(registered)(
    "%s has a reporting and a silent case, or a reason it cannot",
    (id) => {
      expect(
        id in CASES || id in EXEMPT,
        `${id}: no cases in rule-cases.test.ts`,
      ).toBe(true);
    },
  );

  it("no case or exemption names a rule the registry does not hold", () => {
    expect(
      [...Object.keys(CASES), ...Object.keys(EXEMPT)].filter(
        (id) => !registered.includes(id),
      ),
    ).toEqual([]);
  });
});

describe.each(Object.entries(CASES))("%s, through real ESLint", (id, c) => {
  it(`reports on ${c.reports.file}:${String(c.reports.line)} at severity ${String(c.reports.severity)}`, async () => {
    const got = (await lintTree(c.reports.tree)).filter((m) => m.ruleId === id);
    expect(
      got.some(
        (m) =>
          m.file === c.reports.file &&
          m.line === c.reports.line &&
          m.severity === c.reports.severity,
      ),
      JSON.stringify(got),
    ).toBe(true);
  });

  it("stays silent on a conforming paper", async () => {
    expect((await lintTree(c.silent)).filter((m) => m.ruleId === id)).toEqual(
      [],
    );
  });
});
