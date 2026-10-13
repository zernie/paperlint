/**
 * THE PAPER FOLDER'S LAYOUT — what may stand at the root of a paper folder, and nothing else.
 *
 * A paper folder collects files the way a desk does: plans, mails, three drafts of the PDF, a corpus,
 * an old attempt's checklist. Each was put there for a reason, and after a few months nobody can say
 * which file is current, which folder holds the evidence, or where a new thing goes. A strict root is
 * the answer every build tool gives (Cargo's `src/`, a Maven layout): the root holds a small, known
 * set, every known kind of material has one folder, and ONE escape hatch, `extra/`, takes the rest
 * without judging it.
 *
 * ── WHERE THE SET COMES FROM ─────────────────────────────────────────────────────
 * Each entry is a file or folder paperlint itself writes or reads, or one its skills name at the
 * paper root (each carries its note below, which the drawing of the layout shows):
 *   - what `paperlint new` scaffolds: `PIPELINE-STATUS.md`, `paper.tex`, `paperlint.json`;
 *   - what the build writes: `paper.pdf` and `_build/`, and TeX's own byproducts beside `paper.tex`
 *     (pdflatex runs in the paper folder without `-output-directory`), which are never reported;
 *   - what the rules read: `versions/` (`paper/stages`), `reviews/` (`review/frontmatter`),
 *     `siblings/` (`sibling/frontmatter`), `talk/` (the `talk/` rules' default folder);
 *   - what the skills read or write at the root: `README.md`, `CLAUDE.md`, `CLAIMS.md`, `NOTES.md`,
 *     `SUBMIT-CHECKLIST.md`, `research/`, `repro/`, `figures/`, `submission/`;
 *   - where the paper's own body lives when it is split: `sections/` (README's `\input{sections/intro}`);
 *   - the files TeX and bibtex look up in the folder they run in: `*.tex`, `*.bib`, `*.cls`, `*.sty`,
 *     `*.bst`.
 * A venue's corpus of accepted papers is NOT here: it is shared by every paper for that venue and
 * lives outside paper folders, in `<papers>/venues/<venue>/`.
 *
 * ── WHAT THE PAPER DECLARES ──────────────────────────────────────────────────────
 * A paper's settings may move three of these: `pdf` (the built PDF under another name), `talk.dir`
 * (another talk folder) and a preset file of its own named by `extends`. What the settings name at the
 * root is allowed beside the fixed set (`Declared.roots`); this module does not read settings.
 */
import { basename, extname } from "node:path";
import { leaf, renderTree, type TreeNode } from "./layout-tree.ts";
import { REPRO_DIR, REPRO_NODES } from "./repro-layout.ts";

/** One entry at the paper folder's root: its name, and whether it is a folder. */
export interface LayoutEntry {
  readonly name: string;
  readonly kind: "file" | "dir";
}

/** What the paper's own settings name at its root (`pdf`, `talk.dir`, a preset of its own). */
export interface Declared {
  readonly roots: readonly string[];
}

export const NOTHING_DECLARED: Declared = { roots: [] };

/** An entry that is not part of the layout, with where such material belongs. */
export interface Stray {
  /** The entry's name; a folder's ends in a slash. */
  readonly name: string;
  readonly kind: "file" | "dir";
  /** Where it goes: one destination for a known name, else the choice by what it is. */
  readonly cure: string;
}

/** The one folder whose content is not judged. */
export const ESCAPE_HATCH = "extra";

/** An allowed entry's name, with what it is for — the note the layout's drawing shows beside it. */
export interface Noted {
  readonly name: string;
  readonly note: string;
}

/** The files the root may hold, by exact name, each with what it is for. */
export const ROOT_FILE_NOTES: readonly Noted[] = [
  {
    name: "PIPELINE-STATUS.md",
    note: "the paper's one live-state file: stages, plan, scorecard",
  },
  { name: "paper.tex", note: "the source; `paperlint build` compiles it" },
  { name: "paperlint.json", note: "the paper's settings" },
  { name: "README.md", note: "what the paper is" },
  { name: "CLAUDE.md", note: "the paper's agent rules" },
  { name: "CLAIMS.md", note: "the claims ledger" },
  {
    name: "NOTES.md",
    note: "each number in the paper → the data it comes from",
  },
  {
    name: "SUBMIT-CHECKLIST.md",
    note: "the venue's format and submission mechanics",
  },
  { name: ".gitignore", note: "keeps the build's byproducts out of git" },
  { name: "paper.pdf", note: "the built PDF" },
];

/** The files the root may hold, by exact name. */
export const ROOT_FILES: readonly string[] = ROOT_FILE_NOTES.map((f) => f.name);

/** The folders the root may hold, by exact name, each with what it holds. */
export const ROOT_DIR_NOTES: readonly Noted[] = [
  { name: "_build", note: "the facts `paperlint build` writes" },
  { name: "versions", note: "each stage's frozen PDF and source" },
  { name: "reviews", note: "dated reviews and pass reports" },
  { name: "siblings", note: "the cards of competing papers" },
  { name: "research", note: "dated research and decision records" },
  { name: REPRO_DIR, note: "the reproduction artifact" },
  { name: "figures", note: "graphics and their sources" },
  { name: "sections", note: "the body, when it is split" },
  { name: "talk", note: "the talk's files" },
  {
    name: "submission",
    note: "forms, portal records, mail with the venue, the anonymized upload",
  },
  { name: ESCAPE_HATCH, note: "anything; never judged" },
];

/** The folders the root may hold, by exact name. */
export const ROOT_DIRS: readonly string[] = ROOT_DIR_NOTES.map((d) => d.name);

/**
 * The files TeX and bibtex look up in the folder they run in, which is the paper's root: a fragment
 * `\input` names, a database, a class, a package, a bibliography style.
 */
export const TEX_INPUT_EXTENSIONS: readonly string[] = [
  ".tex",
  ".bib",
  ".cls",
  ".sty",
  ".bst",
];

/**
 * The extensions of what a TeX run writes next to its main file, named after the job. The list is
 * the union of latexmk's clean lists (`@generated_exts`, `$clean_ext` and `$clean_full_ext` in the
 * latexmk documentation, the files `latexmk -c` and `-C` delete) and the outputs of the tools
 * `paperlint build` and a hand run use on the same job: pdflatex (`aux log out toc lof lot lol fls
 * xdv dvi`, `synctex.gz` with `-synctex`), bibtex (`bbl blg`), makeindex (`idx ind ilg`), glossaries
 * and nomencl (`glo gls glg acn acr alg ist nlo nls`), biber and biblatex (`bcf run.xml`), beamer
 * (`nav snm vrb`), and latexmk's own `fdb_latexmk`. A missing extension is added here, not
 * special-cased where the rule is judged.
 */
const BYPRODUCT_EXTENSIONS: readonly string[] = [
  "aux",
  "log",
  "out",
  "toc",
  "lof",
  "lot",
  "lol",
  "fls",
  "xdv",
  "dvi",
  "synctex.gz",
  "bbl",
  "blg",
  "idx",
  "ind",
  "ilg",
  "glo",
  "gls",
  "glg",
  "acn",
  "acr",
  "alg",
  "ist",
  "nlo",
  "nls",
  "bcf",
  "run.xml",
  "nav",
  "snm",
  "vrb",
  "fdb_latexmk",
];

/**
 * What a `paperlint build` leaves beside `paper.tex`: pdflatex and bibtex run in the paper folder and
 * name every output after the job, `paper`, so only `paper.<extension>` is the build's. Never
 * reported — they are the build's, not the author's. Another job name (`draft.aux`) is the author's.
 */
export const BUILD_BYPRODUCTS: readonly string[] = BYPRODUCT_EXTENSIONS.map(
  (ext) => `paper.${ext}`,
);

/** Files the operating system writes into any folder it shows. Never reported. */
export const OS_FILES: readonly string[] = [".DS_Store", "Thumbs.db"];

/** The live state of a paper — its stages, its plan, its scorecard — is one file. */
const STATUS_SECTIONS =
  'a section of PIPELINE-STATUS.md — the paper\'s one live-state file holds its stages, its plan ("Plan / now") and its scorecard; move what is still live there and delete the file';

/** The shared corpus of a venue's accepted papers. */
const VENUE_CORPUS =
  "<papers-root>/venues/<venue>/, outside the paper folder: one corpus per venue, shared by every paper that targets it";

/**
 * Names met in real paper folders, each with its one destination. Matched ignoring case, a file's
 * name against files and a folder's against folders.
 */
export const KNOWN_CURES: readonly {
  readonly name: string;
  readonly kind: "file" | "dir";
  readonly cure: string;
}[] = [
  { name: "PLAN.md", kind: "file", cure: STATUS_SECTIONS },
  { name: "plans", kind: "dir", cure: STATUS_SECTIONS },
  { name: "DECISION-LOG.md", kind: "file", cure: "research/ (a dated record)" },
  {
    name: "EMAILS.md",
    kind: "file",
    cure: "submission/ (mail with the venue is about submitting)",
  },
  {
    name: "data",
    kind: "dir",
    cure: "repro/data/ (the data behind the numbers)",
  },
  {
    name: "artifact",
    kind: "dir",
    cure: "repro/ — its scripts in repro/tools/, its data in repro/data/; the anonymized copy uploaded for review is about submitting and goes in submission/",
  },
  {
    name: "archive",
    kind: "dir",
    cure: "versions/ for frozen PDFs, submission/ for an earlier attempt's forms, mails and checklists, extra/ for the rest",
  },
  { name: "venue-corpus", kind: "dir", cure: VENUE_CORPUS },
  { name: "venues", kind: "dir", cure: VENUE_CORPUS },
];

/** For a name nobody listed: the choice by what the material is. */
export const CURE_BY_KIND =
  "decide by what it is — a record or research → research/; about submitting (forms, mails, checklists, portal records) → submission/; live state of the paper (plan, status) → a section of PIPELINE-STATUS.md; reproduction (scripts, data, the artifact) → repro/; a frozen PDF of a stage → versions/; unclear → extra/, which is never judged";

const isAllowedFile = (name: string, declared: Declared): boolean =>
  ROOT_FILES.includes(name) ||
  TEX_INPUT_EXTENSIONS.includes(extname(name)) ||
  BUILD_BYPRODUCTS.includes(name) ||
  OS_FILES.includes(name) ||
  declared.roots.includes(name);

const isAllowed = (e: LayoutEntry, declared: Declared): boolean =>
  e.kind === "dir"
    ? ROOT_DIRS.includes(e.name) || declared.roots.includes(e.name)
    : isAllowedFile(e.name, declared);

/** Where material like `e` belongs: its listed destination, else the choice by what it is. */
function cureFor(e: LayoutEntry): string {
  const known = KNOWN_CURES.find(
    (c) => c.kind === e.kind && c.name.toLowerCase() === e.name.toLowerCase(),
  );
  return known === undefined ? CURE_BY_KIND : known.cure;
}

/** The root entries that are not part of the layout, in the order given. Pure. */
export function judgeLayout(
  entries: readonly LayoutEntry[],
  declared: Declared,
): readonly Stray[] {
  // `\include{chapter}` makes pdflatex write chapter.aux beside chapter.tex, under that file's own
  // name, not the job's: the build's for every source at the root, the author's without one.
  const includeAux = entries
    .filter((e) => e.kind === "file" && extname(e.name) === ".tex")
    .map((e) => `${basename(e.name, ".tex")}.aux`);
  return entries
    .filter(
      (e) =>
        !isAllowed(e, declared) &&
        !(e.kind === "file" && includeAux.includes(e.name)),
    )
    .map((e) => ({
      name: e.kind === "dir" ? `${e.name}/` : e.name,
      kind: e.kind,
      cure: cureFor(e),
    }));
}

/** The paper folder's layout, entry by entry, `repro/` drawn with its own layout inside. */
export const PAPER_NODES: readonly TreeNode[] = [
  ...ROOT_FILE_NOTES.map((f) => leaf(f.name, f.note)),
  leaf(
    TEX_INPUT_EXTENSIONS.map((e) => `*${e}`).join(" "),
    "what TeX and bibtex look up beside paper.tex",
  ),
  ...ROOT_DIR_NOTES.map((d) => ({
    name: `${d.name}/`,
    note: d.note,
    children: d.name === REPRO_DIR ? REPRO_NODES : [],
  })),
];

/** The drawing of the paper folder's layout: the rule's message, the hook's refusal, the rule's page. */
export const PAPER_LAYOUT_TREE: string = renderTree("<paper>/", PAPER_NODES);

/** The folder beside the paper folders that holds one corpus of accepted papers per venue. */
export const VENUES_DIR = "venues";

/**
 * The papers directory as the README and `docs/layout.md` draw it: the venues' corpora beside the
 * paper folders, and each paper folder with its layout. Only the paper folder's part is enforced (by
 * the two layout rules); `venues/` is drawn so a reader sees where a corpus goes, and no rule reads it.
 */
export const PAPERS_NODES: readonly TreeNode[] = [
  {
    name: `${VENUES_DIR}/`,
    note: "outside every paper folder: one folder per venue",
    children: [
      leaf(
        "<venue>/",
        "that venue's accepted papers, shared by every paper aimed at it",
      ),
    ],
  },
  {
    name: "<paper>/",
    note: "one folder per paper, named after the work; its root holds only what is below",
    children: PAPER_NODES,
  },
];

/** The drawing of the papers directory: the README's and `docs/layout.md`'s map of where things live. */
export const PAPERS_LAYOUT_TREE: string = renderTree(
  "<papers-root>/",
  PAPERS_NODES,
);

/**
 * The one text a stray entry is reported with, by the rule `paper/folder-layout` and by the hook that
 * refuses to create such an entry. It stands alone: where the entry goes, and the whole layout drawn,
 * for a reader who knows nothing of paperlint.
 */
export function strayMessage(s: Stray): string {
  return [
    `\`${s.name}\` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md), and that root holds only paperlint's layout. Where it goes: ${s.cure}.`,
    `The layout (${ESCAPE_HATCH}/ takes anything and is never judged; the build's paper.* byproducts are never reported):`,
    PAPER_LAYOUT_TREE,
    `Rule paper/folder-layout: https://github.com/zernie/paperlint/blob/main/docs/rules/paper/folder-layout.md`,
  ].join("\n");
}
