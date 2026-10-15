/**
 * THE LAYOUT OF A PAPER'S `repro/` — what may stand at its top, and nothing else.
 *
 * `repro/` is where a paper's evidence lives, and it fills up the way a desk does: one real paper had
 * 120 entries at its top, about 70 study folders (some with no date) and about 50 loose scripts, data
 * files and notes. Nobody could say which script produces which number, which study is current, or
 * where a new run goes. The layout gives each kind of material one place:
 *
 *   repro/
 *   ├── README.md              the index: one line per study, generated from studies.json
 *   ├── studies.json           the study registry: one row per study (src/domain/study-registry.ts)
 *   ├── <id>-<slug>/           one folder per study or spike, named by its row, with a README.md inside
 *   ├── tools/                 scripts used across the paper (numbers, figures, anonymity check, harnesses)
 *   └── data/                  shared data (tables, caches)
 *
 * plus `.gitignore`. A loose note belongs in its study's folder or in the paper's `research/`.
 *
 * ── A STUDY'S NAME ───────────────────────────────────────────────────────────────
 * `<id>-<slug>` (`P1-S03-baseline`): the id of the study's row in `repro/studies.json` — the paper's
 * prefix, `-S`, two or more digits — then the slug. Whether the id has a row, and the row this folder,
 * is `repro/study-registered`'s question; this layout only accepts the shape.
 *
 * The older form, `<slug>-YYYY-MM-DD`, stays accepted, so a paper that turned the registry off is not
 * broken: the date is the day the study began. `<slug>-YYYY-MM` is accepted too: a study that ran
 * over weeks (labelling, a reading of a corpus) has a month as its honest date, and both forms sort
 * by time. The date must be a real one (no month 13, no 30 February). The slug is lowercase letters
 * and digits in words joined by single hyphens.
 *
 * ── NEVER REPORTED ───────────────────────────────────────────────────────────────
 * What interpreters, package managers and the operating system leave in any folder they run in
 * (`__pycache__/`, `node_modules/`, `.DS_Store`, …): the scripts' byproducts, not the author's.
 *
 * Pure: the caller lists the folder and says which study folders hold a `README.md`.
 */
import { extname } from "node:path";
import { leaf, renderTree, type TreeNode } from "./layout-tree.ts";

/** The folder this layout governs, at the paper folder's root. */
export const REPRO_DIR = "repro";

/** The study registry, at the top of `repro/` (src/domain/study-registry.ts). */
export const STUDIES_FILE = "studies.json";

/** The index at the top of `repro/`, and the file every study folder holds. */
export const README = "README.md";

/** The files `repro/` may hold at its top, by exact name. */
export const REPRO_FILE_NOTES: readonly {
  readonly name: string;
  readonly note: string;
}[] = [
  {
    name: README,
    note: "the index: one line per study, generated from studies.json",
  },
  {
    name: STUDIES_FILE,
    note: "the study registry: id, title, status and result of each study",
  },
  { name: ".gitignore", note: "keeps the scripts' byproducts out of git" },
];
export const REPRO_FILES: readonly string[] = REPRO_FILE_NOTES.map(
  (f) => f.name,
);

/** The shared folders `repro/` may hold besides its study folders. */
export const TOOLS_DIR = "tools";
export const DATA_DIR = "data";
export const REPRO_DIR_NOTES: readonly {
  readonly name: string;
  readonly note: string;
}[] = [
  {
    name: TOOLS_DIR,
    note: "scripts used across the paper (numbers, figures, anonymity check, harnesses)",
  },
  { name: DATA_DIR, note: "shared data (tables, caches)" },
];
export const REPRO_DIRS: readonly string[] = REPRO_DIR_NOTES.map((d) => d.name);

/** The study folder as the layout draws it: the name pattern, and the README.md it must hold. */
const STUDY_NODE: TreeNode = {
  name: "<id>-<slug>/",
  note: "one folder per study or spike, named by its row in studies.json (P1-S03-baseline)",
  children: [
    leaf(README, "required: what it asks, how to run it, what it found"),
  ],
};

/** The layout of `repro/`, entry by entry. */
export const REPRO_NODES: readonly TreeNode[] = [
  ...REPRO_FILE_NOTES.map((f) => leaf(f.name, f.note)),
  ...REPRO_DIR_NOTES.map((d) => leaf(`${d.name}/`, d.note)),
  STUDY_NODE,
];

/** The drawing of `repro/`'s layout: the rule's message, the hook's refusal, the rule's page. */
export const REPRO_LAYOUT_TREE: string = renderTree(
  `${REPRO_DIR}/`,
  REPRO_NODES,
);

/**
 * What interpreters, package managers, test runners and the operating system write into the folder
 * they run in. Never reported, whether a file or a folder.
 */
export const REPRO_BYPRODUCTS: readonly string[] = [
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".ipynb_checkpoints",
  "node_modules",
  ".venv",
  ".DS_Store",
  "Thumbs.db",
];

/** A slug: lowercase letters and digits, in words joined by single hyphens. */
export const STUDY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A dated study's name: a slug, then the year, the month, and optionally the day it began. */
const STUDY_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{4})-(\d{2})(?:-(\d{2}))?$/u;

/** A registered study's name: the id (a prefix, `-S`, two or more digits), then the slug. */
const REGISTERED_STUDY_NAME =
  /^[A-Z][A-Z0-9]*-S\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Whether `name` is a registered study folder's: `<id>-<slug>`, as `P1-S03-baseline`. */
export const isRegisteredStudyName = (name: string): boolean =>
  REGISTERED_STUDY_NAME.test(name);

const isLeapYear = (y: number): boolean =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The days in month `m` (1–12) of year `y`. */
const daysIn = (y: number, m: number): number =>
  m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

/** Whether `name` is a dated study folder's: `<slug>-YYYY-MM-DD` or `<slug>-YYYY-MM`, a real date. */
function isDatedStudyName(name: string): boolean {
  const m = STUDY_NAME.exec(name);
  if (m === null) return false;
  const year = Number(m[2]);
  const month = Number(m[3]);
  const day = m[4] === undefined ? 1 : Number(m[4]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
}

/** Whether `name` is a study folder's: `<id>-<slug>`, or the dated `<slug>-YYYY-MM-DD` / `<slug>-YYYY-MM`. */
export const isStudyName = (name: string): boolean =>
  isRegisteredStudyName(name) || isDatedStudyName(name);

/**
 * The study name to suggest for a folder named `name`: its name as a slug, with the date to fill in.
 * A name that becomes a study name once lowercased and hyphenated is suggested as it is.
 */
export function suggestedStudyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (isDatedStudyName(slug)) return slug;
  return `${suggestedSlug(name)}-YYYY-MM-DD`;
}

/** The slug to suggest for a folder named `name`: its name as a slug, any trailing date dropped. */
export function suggestedSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/(?:^|-)\d{4}(?:-\d{1,2}){0,2}$/u, "");
  return base === "" ? "<slug>" : base;
}

/** The extensions of a script: what a study or the paper's build runs. */
export const SCRIPT_EXTENSIONS: readonly string[] = [
  ".py",
  ".ipynb",
  ".sh",
  ".bash",
  ".zsh",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".r",
  ".jl",
  ".rb",
  ".pl",
  ".awk",
  ".sql",
];

/** Names without a script's extension that still say how the tools run. */
export const TOOL_FILES: readonly string[] = [
  "Makefile",
  "Dockerfile",
  "requirements.txt",
  "pyproject.toml",
  "uv.lock",
  "package.json",
  "package-lock.json",
];

/** The extensions of data: tables, records, caches, archives, raw output. */
export const DATA_EXTENSIONS: readonly string[] = [
  ".tsv",
  ".csv",
  ".json",
  ".jsonl",
  ".ndjson",
  ".yaml",
  ".yml",
  ".xml",
  ".txt",
  ".log",
  ".parquet",
  ".sqlite",
  ".db",
  ".xlsx",
  ".npy",
  ".npz",
  ".pkl",
  ".gz",
  ".zip",
  ".tar",
];

/** The extensions of a note. */
export const NOTE_EXTENSIONS: readonly string[] = [".md", ".markdown"];

/** Where a script goes. */
export const SCRIPT_CURE =
  "repro/tools/ — the scripts used across the paper (numbers, figures, the anonymity check, harnesses); a script only one study runs goes in that study's folder instead";

/** Where data goes. */
export const DATA_CURE =
  "repro/data/ — the data shared across the paper (tables, caches); what one study's run produced goes in that study's folder instead";

/** Where a note goes. */
export const NOTE_CURE =
  "the folder of the study it is about (repro/<id>-<slug>/), or the paper's research/ when it is research or a decision rather than the record of a run";

/** Where a file of any other kind goes. */
export const FILE_CURE_BY_KIND =
  "decide by what it is — a script → repro/tools/; data → repro/data/; a note → the folder of its study, or the paper's research/; what one study produced → that study's folder";

/** The files paperlint itself once kept at the top of `repro/`, each with where it is read now. */
export const MOVED_FILES: readonly {
  readonly name: string;
  readonly cure: string;
}[] = [
  {
    name: "references-cache.json",
    cure: "repro/data/references-cache.json, where `paperlint build` reads and writes the citation services' answers (`git mv repro/references-cache.json repro/data/`); until it is moved, the next build asks every service again",
  },
  {
    name: "refs-cache.json",
    cure: "repro/data/refs-cache.json, where the paper-pipeline's extract-ref-facts script keeps its raw answers (`git mv repro/refs-cache.json repro/data/`)",
  },
  {
    name: "generated-code-grandfathered.txt",
    cure: "repro/tools/generated-code-grandfathered.txt, where the paper-pipeline's generated-code check reads it (`git mv repro/generated-code-grandfathered.txt repro/tools/`)",
  },
];

/** Where a stray file goes: a file paperlint moved, else by the kind its name says. */
function fileCure(name: string): string {
  const moved = MOVED_FILES.find((f) => f.name === name);
  if (moved !== undefined) return moved.cure;
  const ext = extname(name).toLowerCase();
  if (TOOL_FILES.includes(name) || SCRIPT_EXTENSIONS.includes(ext))
    return SCRIPT_CURE;
  if (DATA_EXTENSIONS.includes(ext)) return DATA_CURE;
  if (NOTE_EXTENSIONS.includes(ext)) return NOTE_CURE;
  return FILE_CURE_BY_KIND;
}

/** Where a folder with no study name goes: renamed as a study, or emptied into the shared folders. */
const folderCure = (name: string): string =>
  `rename it to \`<id>-${suggestedSlug(name)}\` — the next free id in repro/${STUDIES_FILE}, then what it is — give it its row there and a README.md (\`npx paperlint studies new\` makes all three for a new study); in a paper with repro/study-registered off, \`${suggestedStudyName(name)}\` is accepted instead, dated by the day it began — its first commit is a fine default (\`git log --reverse --format=%as -- repro/${name} | head -1\`, run in the paper folder); if it holds scripts or data shared across the paper instead, move them into repro/tools/ or repro/data/`;

/** An entry at the top of `repro/`: a file or a folder, and for a folder whether it holds a README.md. */
export interface ReproEntry {
  readonly name: string;
  readonly kind: "file" | "dir";
  readonly hasReadme: boolean;
}

/** What is wrong with an entry at the top of `repro/`. */
export interface ReproFinding {
  /** The entry's path from the paper folder; a folder's ends in a slash. */
  readonly path: string;
  /** `stray`: not part of the layout. `no-readme`: a study folder without its README.md. */
  readonly problem: "stray" | "no-readme";
  /** Where it goes, or what to add. */
  readonly cure: string;
}

const isAllowed = (e: ReproEntry): boolean =>
  REPRO_BYPRODUCTS.includes(e.name) ||
  (e.kind === "file"
    ? REPRO_FILES.includes(e.name)
    : REPRO_DIRS.includes(e.name) || isStudyName(e.name));

/** The one finding for `e`, or null when it is in its place. */
function judgeEntry(e: ReproEntry): ReproFinding | null {
  const path = `${REPRO_DIR}/${e.name}${e.kind === "dir" ? "/" : ""}`;
  if (!isAllowed(e))
    return {
      path,
      problem: "stray",
      cure: e.kind === "dir" ? folderCure(e.name) : fileCure(e.name),
    };
  if (e.kind === "dir" && isStudyName(e.name) && !e.hasReadme)
    return {
      path,
      problem: "no-readme",
      cure: `add ${path}${README} — what the study asks, how to run it, what it found — and give the study its row in repro/${STUDIES_FILE}`,
    };
  return null;
}

/** The entries at the top of `repro/` that are out of place, at most one finding each, in order. Pure. */
export function judgeRepro(
  entries: readonly ReproEntry[],
): readonly ReproFinding[] {
  return entries.map(judgeEntry).filter((f): f is ReproFinding => f !== null);
}

/**
 * The one text a finding is reported with, by the rule `repro/allowed-files-only` and by the hook that fires
 * when such an entry is written. It stands alone: what is wrong, where the entry goes, and what
 * `repro/` holds, for a reader who knows nothing of paperlint.
 */
export function reproMessage(f: ReproFinding): string {
  const head =
    f.problem === "stray"
      ? `\`${f.path}\` is loose at the top of the paper's repro/ folder, which holds only an index, the study registry, the shared tools and data, and one folder per study. Where it goes: ${f.cure}.`
      : `\`${f.path}\` is a study folder without a ${README}, and every study in repro/ has one. What to do: ${f.cure}.`;
  return [
    head,
    "What repro/ holds (what interpreters and package managers leave there, like __pycache__/ and node_modules/, is never reported):",
    REPRO_LAYOUT_TREE,
    `Rule repro/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/allowed-files-only.md`,
  ].join("\n");
}
