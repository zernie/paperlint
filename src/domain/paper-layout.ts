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
 *   - what the rules read: `versions/` (`versions/layout`, `paper/stages`), `reviews/` (`review/frontmatter`),
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
import {
  DATA_EXTENSIONS,
  NOTE_EXTENSIONS,
  REPRO_DIR,
  REPRO_NODES,
  SCRIPT_EXTENSIONS,
  TOOL_FILES,
} from "./repro-layout.ts";

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
  /** Where it goes: one destination, by its name, else by its kind, else `extra/`. */
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
  {
    name: "versions",
    note: "each stage's frozen PDF and source — per attempt, versions/<cycle>/, with lock.json",
  },
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
 * xdv dvi`, `synctex.gz` with `-synctex`), the algorithm packages' `\listofalgorithms` (`loa`),
 * bibtex (`bbl blg`), makeindex (`idx ind ilg`), glossaries and nomencl (`glo gls glg acn acr alg ist
 * nlo nls`), biber and biblatex (`bcf run.xml`), beamer (`nav snm vrb`), and latexmk's own
 * `fdb_latexmk`. A missing extension is added here, not
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
  "loa",
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
const STATUS_SECTIONS = "a section of PIPELINE-STATUS.md";

/** The shared corpus of a venue's accepted papers, outside every paper folder. */
const VENUE_CORPUS = "<papers-root>/venues/<venue>/";

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
  { name: "DECISION-LOG.md", kind: "file", cure: "research/" },
  { name: "EMAILS.md", kind: "file", cure: "submission/" },
  { name: "data", kind: "dir", cure: "repro/data/" },
  { name: "artifact", kind: "dir", cure: "repro/" },
  { name: "archive", kind: "dir", cure: `${ESCAPE_HATCH}/` },
  { name: "venue-corpus", kind: "dir", cure: VENUE_CORPUS },
  { name: "venues", kind: "dir", cure: VENUE_CORPUS },
];

/** The extensions of the images a figure is drawn from. */
export const IMAGE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".eps",
];

/**
 * For a file nobody listed: the folder its kind names, by its exact name or its extension (matched
 * ignoring case). The same kinds `repro/allowed-files-only` sorts by. No `.pdf`: a root PDF may be
 * a figure, a draft or a review, and `versions/` holds only cycle folders (`versions/layout`).
 */
export const CURE_BY_FILE: readonly {
  readonly names: readonly string[];
  readonly extensions: readonly string[];
  readonly cure: string;
}[] = [
  { names: TOOL_FILES, extensions: SCRIPT_EXTENSIONS, cure: "repro/tools/" },
  { names: [], extensions: DATA_EXTENSIONS, cure: "repro/data/" },
  { names: [], extensions: IMAGE_EXTENSIONS, cure: "figures/" },
  { names: [], extensions: NOTE_EXTENSIONS, cure: "research/" },
];

/** For anything else: the folder that is never judged. */
export const CURE_BY_DEFAULT = `${ESCAPE_HATCH}/`;

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

/** Where `e` belongs: its listed destination, else its kind's folder, else `extra/`. */
function cureFor(e: LayoutEntry): string {
  const known = KNOWN_CURES.find(
    (c) => c.kind === e.kind && c.name.toLowerCase() === e.name.toLowerCase(),
  );
  if (known !== undefined) return known.cure;
  const ext = extname(e.name).toLowerCase();
  const byKind =
    e.kind === "file"
      ? CURE_BY_FILE.find(
          (c) => c.names.includes(e.name) || c.extensions.includes(ext),
        )
      : undefined;
  return byKind?.cure ?? CURE_BY_DEFAULT;
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

/** The drawing of the paper folder's layout, which the rule's page embeds. */
export const PAPER_LAYOUT_TREE: string = renderTree("<paper>/", PAPER_NODES);

/** The folder beside the paper folders that holds one corpus of accepted papers per venue. */
export const VENUES_DIR = "venues";

/**
 * The papers directory as the README and `docs/layout.md` draw it: the venues' corpora beside the
 * paper folders, and each paper folder with its layout. The paper folder's part is enforced by the two
 * layout rules; each corpus in `venues/` by `corpus/record` and `corpus/allowed-files-only`, whose
 * layout is `corpus-layout.ts`.
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
 * The one text a stray entry is reported with, by the rule `paper/allowed-files-only` and by the hook that
 * refuses to create such an entry: one line, the entry and its one destination. The layout, and how
 * each destination is picked, are on the rule's page, which the finding's rule id names.
 */
export function strayMessage(s: Stray): string {
  const fallback =
    s.cure === CURE_BY_DEFAULT ? "the folder for its kind" : CURE_BY_DEFAULT;
  return `\`${s.name}\` does not belong at a paper folder's root: move it to ${s.cure}, or ${fallback}.`;
}
