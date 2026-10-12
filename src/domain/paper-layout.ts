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
 * paper root (docs/rules/paper/folder-layout.md has the reason per entry):
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
import { extname } from "node:path";

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

/** The files the root may hold, by exact name. */
export const ROOT_FILES: readonly string[] = [
  "PIPELINE-STATUS.md",
  "paper.tex",
  "paperlint.json",
  "README.md",
  "CLAUDE.md",
  "CLAIMS.md",
  "NOTES.md",
  "SUBMIT-CHECKLIST.md",
  ".gitignore",
  "paper.pdf",
];

/** The folders the root may hold, by exact name. */
export const ROOT_DIRS: readonly string[] = [
  "_build",
  "versions",
  "reviews",
  "siblings",
  "research",
  "repro",
  "figures",
  "sections",
  "talk",
  "submission",
  ESCAPE_HATCH,
];

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
 * What a `paperlint build` leaves beside `paper.tex`: pdflatex and bibtex run in the paper folder and
 * name every output after the job, `paper`. Never reported — they are the build's, not the author's.
 * The list is the outputs of pdflatex with `-recorder`, bibtex, hyperref, and the tables of contents
 * and figures; `synctex.gz`, `fdb_latexmk`, `bcf` and `run.xml` are an editor's or latexmk's or
 * biber's, run on the same job by hand.
 */
export const BUILD_BYPRODUCTS: readonly string[] = [
  "aux",
  "log",
  "bbl",
  "blg",
  "out",
  "fls",
  "toc",
  "lof",
  "lot",
  "synctex.gz",
  "fdb_latexmk",
  "bcf",
  "run.xml",
].map((ext) => `paper.${ext}`);

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
  return entries
    .filter((e) => !isAllowed(e, declared))
    .map((e) => ({
      name: e.kind === "dir" ? `${e.name}/` : e.name,
      kind: e.kind,
      cure: cureFor(e),
    }));
}

/**
 * The one text a stray entry is reported with, by the rule `paper/folder-layout` and by the hook that
 * fires when such an entry is written. It stands alone: it names what is allowed and where the entry
 * goes, for a reader who knows nothing of paperlint.
 */
export function strayMessage(s: Stray): string {
  const files = ROOT_FILES.join(", ");
  const dirs = ROOT_DIRS.map((d) => `${d}/`).join(", ");
  return [
    `\`${s.name}\` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md), and that root holds only paperlint's layout.`,
    `Where it goes: ${s.cure}.`,
    `Allowed at the root — files: ${files}, the TeX inputs *${TEX_INPUT_EXTENSIONS.join(", *")}, and the build's paper.* byproducts; folders: ${dirs} (${ESCAPE_HATCH}/ takes anything and is never judged).`,
    `Rule paper/folder-layout: https://github.com/zernie/paperlint/blob/main/docs/rules/paper/folder-layout.md`,
  ].join(" ");
}
