/**
 * WHAT `paperlint new` PUTS IN A NEW PAPER FOLDER BESIDE ITS THREE FILES — the layout, visible from the
 * first commit.
 *
 * The rules `paper/folder-layout` and `paper/repro-layout` say where every kind of material goes. A
 * paper that starts with three files shows none of it, and the first reviewer's report, the first
 * figure and the first script each land loose at the root. So a new folder already holds the places.
 *
 * ── ONE SOURCE OF TRUTH ──────────────────────────────────────────────────────────
 * Nothing here lists a folder by hand. The folders are `ROOT_DIR_NOTES` (paper-layout.ts) minus the
 * ones named in `NOT_SCAFFOLDED`, each with its reason; `repro/` gets its own shared folders from
 * `REPRO_DIR_NOTES`. A folder added to the layout is scaffolded unless someone writes down why not,
 * and a test fails on an excluded name the layout no longer has.
 *
 * ── `.gitkeep` ───────────────────────────────────────────────────────────────────
 * Git keeps files, not folders: an empty folder is not in the first commit, which is the point of
 * scaffolding. A folder that holds nothing else gets a `.gitkeep`; a folder that holds a real file
 * (`repro/` with its README.md) gets none. `.gitkeep` is the convention, not a paperlint file, and no
 * rule reads it: `paper/stages` looks for `*.pdf` in `versions/`, the review and sibling rules lint
 * `*.md`, `paper/repro-layout` judges the top of `repro/` only, and neither `tools/` nor `data/` is
 * listed by any rule.
 *
 * Pure: a list of paths and texts, written by `new-paper.ts`.
 */
import { ROOT_DIR_NOTES } from "./paper-layout.ts";
import {
  DATA_DIR,
  README,
  REPRO_DIR,
  REPRO_DIR_NOTES,
  TOOLS_DIR,
} from "./repro-layout.ts";

/** The placeholder git needs to keep an otherwise empty folder. */
export const GITKEEP = ".gitkeep";

/**
 * The folders of the layout that `paperlint new` does not create, each with why. A folder here is
 * allowed at the root all the same; it appears when the work needs it.
 */
export const NOT_SCAFFOLDED: readonly {
  readonly name: string;
  readonly why: string;
}[] = [
  {
    name: "_build",
    why: "`paperlint build` writes it, and an empty one would claim a build that never ran",
  },
  {
    name: "siblings",
    why: "a card is written when a close competitor turns up (skill analyze-sibling-paper, which also writes the folder's README.md index); a paper may have none, and an empty folder reads as an unfinished analysis",
  },
  {
    name: "sections",
    why: "the body is split only when it outgrows `paper.tex`; the stub is one file, and an empty `sections/` suggests the split is expected",
  },
  {
    name: "talk",
    why: "only a paper that declares a talk (`talk` in paperlint.json) has one, and its folder is the declared `talk.dir`, which need not be `talk/`",
  },
  {
    name: "extra",
    why: "the escape hatch for material nothing else takes; it is never judged, so it has no place in a layout meant to be filled by kind",
  },
];

/** The folders at the paper's root that a new paper holds from the first commit, in layout order. */
export const SCAFFOLD_DIRS: readonly string[] = ROOT_DIR_NOTES.map(
  (d) => d.name,
).filter((name) => !NOT_SCAFFOLDED.some((n) => n.name === name));

/**
 * The stub index of `repro/`: it makes the folder non-empty (no `.gitkeep`) and says what the rule
 * asks of it. A line per study is added when the first study is.
 */
export const REPRO_INDEX_STUB = `# Reproduction index

One line per study: \`<slug>-YYYY-MM-DD/\` — what it asks and what it found. Scripts used across the
paper go in \`${TOOLS_DIR}/\`, shared data in \`${DATA_DIR}/\`.
`;

/** A file `paperlint new` writes into a new paper folder, with its path from that folder. */
export interface ScaffoldFile {
  readonly path: string;
  readonly text: string;
}

/**
 * Every file of the layout scaffold, relative to the paper folder, in a fixed order: a `.gitkeep` in
 * each empty folder, and `repro/README.md` where `repro/` would otherwise hold only folders.
 */
export const SCAFFOLD_FILES: readonly ScaffoldFile[] = [
  ...SCAFFOLD_DIRS.flatMap((dir): readonly ScaffoldFile[] =>
    dir === REPRO_DIR
      ? [
          { path: `${REPRO_DIR}/${README}`, text: REPRO_INDEX_STUB },
          ...REPRO_DIR_NOTES.map((d) => ({
            path: `${REPRO_DIR}/${d.name}/${GITKEEP}`,
            text: "",
          })),
        ]
      : [{ path: `${dir}/${GITKEEP}`, text: "" }],
  ),
];
