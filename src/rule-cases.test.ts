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
/** A double-blind venue's paper that declares who wrote it (`anonymity/*`). */
const BLIND = {
  extends: "paperlint:aidc",
  kind: "regular",
  identity: ["Ada Example", "adaexample"],
};
const ACM_TEX = tex("Text.", "\\documentclass[sigconf]{acmart}");

/** The facts of a short agenticdev paper that meets every number in its preset. */
const goodFacts = (): Record<string, unknown> => ({
  schema: 3,
  pages_text: [],
  metadata: {},
  links: [],
  bib_anchor_page: null,
  appendix_anchor_page: null,
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
const ACM_CLASS = "\\documentclass[sigconf]{acmart}";
/** A paper on AgenticDev's preset: it turns `tex/heading-case` on, chicago-headline for the title and every heading. */
const ACM_PRESET = {
  [`${P}/paperlint.json`]: JSON.stringify({
    extends: "paperlint:agenticdev",
    kind: "short",
  }),
};
const IEEE = "\\documentclass[conference,compsoc]{IEEEtran}";
const STATEMENT = "\\section*{LLM Usage Statement}\nNone.";
/** Two `\\documentclass` lines behind a switch: `article` for one venue, `second` for this one. */
const switched = (second: string): string =>
  `\\def\\venue{2}\n\\if\\venue1\n\\documentclass{article}\n\\fi\n\\if\\venue2\n${second}\n\\fi`;
const aidc = (body: string, cls = IEEE) =>
  paper(tex(`\\section{Introduction}\n${body}\n${STATEMENT}`, cls), AIDC);

// ── a paper that declares a talk: a preset of its own over agenticdev, and synthetic media ───────

const media = (name: string): Uint8Array =>
  readFileSync(join(ROOT, "fixtures", "talk", name));
/** The talk block of the tree's own preset: every limit the 3 s, 1280×720 fixture meets. */
const TALK_VENUE = {
  modes: ["remote-video"],
  artifacts: {
    "remote-video": { required: ["video", "one-slide", "captions"] },
  },
  kinds: { short: { slot_s: 10, talk_s_min: 2, talk_s_max: 4 } },
  video: { container: "mp4", min_height_px: 720, max_bytes: 100_000 },
  one_slide: { width_px: 16, height_px: 9 },
};
/** A paper declaring a talk, its preset's `talk` patched, its files replaced or (null) removed. */
const talkPaper = (
  venue: Record<string, unknown> = {},
  talk: Record<string, unknown> | null = { mode: "remote-video" },
  files: Record<string, string | Uint8Array | null> = {},
): Record<string, string | Uint8Array> => {
  const all: Record<string, string | Uint8Array | null> = {
    [`${P}/talk/talk.mp4`]: media("talk.mp4"),
    [`${P}/talk/one-slide.png`]: media("one-slide.png"),
    [`${P}/talk/talk.srt`]: media("talk.srt"),
    ...files,
  };
  return {
    ...paper(ACM_TEX, {
      [`${P}/talk-venue.jsonc`]: JSON.stringify({
        extends: "paperlint:agenticdev",
        talk: { ...TALK_VENUE, ...venue },
      }),
      [`${P}/paperlint.json`]: JSON.stringify({
        extends: "./talk-venue.jsonc",
        kind: "short",
        ...(talk === null ? {} : { talk }),
      }),
    }),
    ...Object.fromEntries(
      Object.entries(all).filter(
        (e): e is [string, string | Uint8Array] => e[1] !== null,
      ),
    ),
  };
};
const onTalk = (
  tree: Record<string, string | Uint8Array>,
  severity: 1 | 2 = 2,
) => ({
  tree,
  file: TEX_FILE,
  severity,
  line: 1,
});

// ── the case table ─────────────────────────────────────────────────────────────────────────────

interface Reports {
  readonly tree: Record<string, string | Uint8Array>;
  /** The file the finding is on, relative to the project. */
  readonly file: string;
  readonly severity: 1 | 2;
  readonly line: number;
}
interface RuleCases {
  readonly reports: Reports;
  /** A tree on which the rule says nothing, on any file. */
  readonly silent: Record<string, string | Uint8Array>;
}

const TEX_FILE = `${P}/paper.tex`;

/** A body of 200 sentences of 14 words: enough words for `tex/register` to judge a rate. */
const FORMAL = Array.from(
  { length: 200 },
  () =>
    "The rule reads the body of the paper and counts every sentence it holds.",
).join(" ");
/** FORMAL with `n` more sentences `s`: a body whose rate of one register measure is set. */
const formalWith = (n: number, s: string): string =>
  `${FORMAL} ${Array.from({ length: n }, () => s).join(" ")}`;
/** FORMAL with enough relation markers for AIDC's band (above 25.4 per 10,000 words). */
const LINKED = formalWith(
  10,
  "Therefore, the rule counts the sentence because the body holds it.",
);
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
  // The class picked behind a TeX switch: two candidates, one of them the venue's or none.
  "tex/template": {
    reports: {
      tree: aidc("Text.", switched("\\documentclass[conference]{IEEEtran}")),
      file: TEX_FILE,
      severity: 2,
      line: 3,
    },
    silent: aidc("Text.", switched(IEEE)),
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
  "tex/heading-case": {
    reports: {
      tree: paper(tex("\\section{Related work}", ACM_CLASS), ACM_PRESET),
      file: TEX_FILE,
      severity: 2,
      line: 3,
    },
    silent: paper(tex("\\section{Related Work}", ACM_CLASS), ACM_PRESET),
  },
  "paper/folder-venue-leftover": {
    reports: {
      // An AIDC paper still in the folder it had when it targeted AISec.
      tree: {
        "papers/aisec-2026/PIPELINE-STATUS.md": STATUS,
        "papers/aisec-2026/paper.tex": tex("x"),
        "papers/aisec-2026/paperlint.json": AIDC[`${P}/paperlint.json`],
      },
      file: "papers/aisec-2026/PIPELINE-STATUS.md",
      severity: 1,
      line: 1,
    },
    // The folder names the paper's own venue.
    silent: {
      "papers/aidc-2026/PIPELINE-STATUS.md": STATUS,
      "papers/aidc-2026/paper.tex": tex("x"),
      "papers/aidc-2026/paperlint.json": AIDC[`${P}/paperlint.json`],
    },
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
  "tex/register": {
    reports: {
      tree: paper(tex(`${FORMAL} But it holds. So it goes. And it ends.`)),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: paper(tex(FORMAL)),
  },
  // The three register bands judge a body against the anchors of AIDC's preset; the body opens on
  // line 3, right after the \\section, where the finding about the whole body stands.
  "tex/contrast-frames": {
    reports: {
      tree: aidc(formalWith(5, "It reads the word, not the operation.")),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: aidc(LINKED),
  },
  "tex/claim-emphasis": {
    reports: {
      tree: aidc(
        formalWith(6, "We find that \\textbf{the rule counts 46 sentences}."),
      ),
      file: TEX_FILE,
      severity: 1,
      line: 3,
    },
    silent: aidc(LINKED),
  },
  "tex/relation-markers": {
    reports: { tree: aidc(FORMAL), file: TEX_FILE, severity: 1, line: 3 },
    silent: aidc(LINKED),
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
  "format/page-limit": {
    reports: onPdf(
      built({ body_pages: 9, pages_by_type: { body: 9, bib: 2 } }),
    ),
    silent: built(),
  },
  "pdf/body-size": {
    reports: onPdf(built({ body_pt: 12 })),
    silent: built(),
  },
  "anonymity/identity": {
    reports: onPdf(
      built({ pages_text: ["Ada Example\n", "References\n"] }, BLIND),
    ),
    silent: built({ pages_text: ["Anonymous\n", "References\n"] }, BLIND),
  },
  "format/layout-override": {
    reports: {
      tree: aidc("\\linespread{0.9}Text."),
      file: TEX_FILE,
      severity: 2,
      line: 4,
    },
    silent: aidc("\\vspace{-2mm}Text."),
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
  "talk/profile": {
    reports: onTalk(talkPaper({}, { mode: "in-person" })),
    silent: talkPaper(),
  },
  "talk/required-files": {
    reports: onTalk(
      talkPaper({}, undefined, { [`${P}/talk/one-slide.png`]: null }),
    ),
    silent: talkPaper(),
  },
  "talk/undeclared": {
    reports: onTalk(talkPaper({}, null), 1),
    silent: talkPaper(),
  },
  "talk/duration": {
    reports: onTalk(
      talkPaper({ kinds: { short: { slot_s: 10, talk_s_max: 2 } } }),
    ),
    silent: talkPaper(),
  },
  "talk/duration-floor": {
    reports: onTalk(
      talkPaper({
        kinds: { short: { slot_s: 10, talk_s_min: 5, talk_s_max: 9 } },
      }),
      1,
    ),
    silent: talkPaper(),
  },
  "talk/video-format": {
    reports: onTalk(
      talkPaper({ video: { container: "mp4", min_height_px: 1080 } }),
    ),
    silent: talkPaper(),
  },
  "talk/one-slide-size": {
    reports: onTalk(
      talkPaper({ one_slide: { width_px: 1920, height_px: 1080 } }),
    ),
    silent: talkPaper(),
  },
  "talk/captions-cover": {
    reports: onTalk(
      talkPaper({}, undefined, {
        [`${P}/talk/talk.srt`]: "1\n00:00:02,000 --> 00:00:02,900\nLate.\n",
      }),
      1,
    ),
    silent: talkPaper(),
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
async function lintTree(
  tree: Record<string, string | Uint8Array>,
): Promise<Message[]> {
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

/**
 * A case lints its tree through the whole CLI: a body long enough for a rate to be judged (2 000
 * words and more) takes seconds under coverage, on a machine running every suite at once.
 */
const CASE_TIMEOUT_MS = 30_000;

describe.each(Object.entries(CASES))("%s, through real ESLint", (id, c) => {
  it(
    `reports on ${c.reports.file}:${String(c.reports.line)} at severity ${String(c.reports.severity)}`,
    { timeout: CASE_TIMEOUT_MS },
    async () => {
      const got = (await lintTree(c.reports.tree)).filter(
        (m) => m.ruleId === id,
      );
      expect(
        got.some(
          (m) =>
            m.file === c.reports.file &&
            m.line === c.reports.line &&
            m.severity === c.reports.severity,
        ),
        JSON.stringify(got),
      ).toBe(true);
    },
  );

  it(
    "stays silent on a conforming paper",
    { timeout: CASE_TIMEOUT_MS },
    async () => {
      expect((await lintTree(c.silent)).filter((m) => m.ruleId === id)).toEqual(
        [],
      );
    },
  );
});
