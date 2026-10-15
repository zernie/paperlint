/**
 * THE STUDY REGISTRY — `repro/studies.json`: one row per study, each with a stable id, a plain name and
 * its status. The design is docs/design/study-registry.md; the rule is `repro/study-registered`
 * (docs/rules/repro/study-registered.md).
 *
 * A paper's `repro/` once reached 79 study folders named `<slug>-YYYY-MM-DD`, and nobody could tell
 * which was which, which had ended, or which a number in the paper came from. Now every study folder is
 * `<id>-<slug>` (`P1-S03-baseline`), and its row says what it asks, where it stands and what it found.
 *
 * ── JSON, NEVER MARKDOWN ─────────────────────────────────────────────────────────
 * The registry is data: its text is parsed once, where it enters, against the schema in
 * `src/adapters/study-registry/` (`StudyRegistryCodec`). The index in `repro/README.md` is OUTPUT: it is
 * generated from the registry and compared as a string, between two fixed markers. Nothing parses it.
 *
 * Pure: the caller lists `repro/`, reads the registry and the README, and says which result files exist.
 */
import { isAbsolute, posix } from "node:path";
import { STUDIES_FILE, STUDY_SLUG } from "./repro-layout.ts";

/** The registry, at the top of the paper's `repro/`; the layout allows it there. */
export { STUDIES_FILE };

export const STUDY_KINDS = [
  "measurement",
  "spike",
  "tooling",
  "data",
  "artifact",
  "salvage",
] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export const STUDY_STATUSES = [
  "designing",
  "running",
  "done",
  "stopped",
  "superseded",
  "dropped",
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** `registry`: listed in the registry only, not in the paper's text. */
export const IN_PAPER = ["yes", "no", "registry"] as const;
export type InPaper = (typeof IN_PAPER)[number];

/** A title is a plain name, not a sentence. */
export const MAX_TITLE_WORDS = 8;

/** A paper's prefix: a capital letter, then capitals or digits (`P1`). */
export const PREFIX_PATTERN = /^[A-Z][A-Z0-9]*$/u;

/** The kind `paperlint studies new` gives a study when none is named. */
export const DEFAULT_KIND: StudyKind = "measurement";

/** The markers around the generated index in `repro/README.md`. Fixed: the rule finds the block by them. */
export const INDEX_BEGIN =
  "<!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->";
export const INDEX_END = "<!-- studies:end -->";

/** The README written when `repro/` has none. */
const INDEX_HEADING = "# Reproduction index";

/**
 * One study. The named fields are the registry's; a row may carry more (a paper merges its own
 * measurement metadata into it), and they are kept as they are.
 */
export interface Study {
  readonly id: string;
  readonly folder: string;
  readonly title: string;
  readonly question: string;
  readonly kind: StudyKind;
  readonly status: StudyStatus;
  readonly date: string;
  readonly result?: string | undefined;
  readonly result_file?: string | undefined;
  readonly superseded_by?: string | undefined;
  readonly in_paper: InPaper;
  readonly [extra: string]: unknown;
}

export interface StudyRegistry {
  readonly prefix: string;
  readonly studies: readonly Study[];
}

/** A registry's text, parsed: the registry, or the one reason it is not one. */
export type ParsedRegistry =
  | { readonly ok: true; readonly registry: StudyRegistry }
  | { readonly ok: false; readonly why: string };

/** What the paper's `repro/` holds of a registry. */
export type RegistryState =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "read"; readonly registry: StudyRegistry };

/** What the judge reads. */
export interface StudyInput {
  /** The study folders at the top of `repro/`: every folder but the shared ones and the byproducts. */
  readonly folders: readonly string[];
  readonly registry: RegistryState;
  /** `repro/README.md`'s text; null when there is none. */
  readonly readme: string | null;
  /** Each `<folder>/<result_file>` of the registry that is a file. */
  readonly existingResults: ReadonlySet<string>;
}

/** One defect of the registry, of a row, or of the index. */
export type StudyFinding =
  | { readonly problem: "no-registry"; readonly folders: readonly string[] }
  | { readonly problem: "unreadable"; readonly why: string }
  | {
      readonly problem: "unregistered";
      readonly folder: string;
      readonly next: string;
    }
  | { readonly problem: "no-folder"; readonly id: string; readonly folder: string }
  | {
      readonly problem: "two-rows";
      readonly folder: string;
      readonly ids: readonly string[];
    }
  | { readonly problem: "bad-id"; readonly id: string; readonly prefix: string }
  | { readonly problem: "duplicate-id"; readonly id: string }
  | {
      readonly problem: "folder-name";
      readonly id: string;
      readonly folder: string;
    }
  | { readonly problem: "long-title"; readonly id: string; readonly words: number }
  | {
      readonly problem: "no-result";
      readonly id: string;
      readonly missing: readonly ("result" | "result_file")[];
    }
  | {
      readonly problem: "result-file";
      readonly id: string;
      readonly path: string;
      readonly why: "missing" | "outside";
    }
  | {
      readonly problem: "no-successor";
      readonly id: string;
      readonly superseded_by: string | null;
    }
  | {
      readonly problem: "stale-index";
      readonly why: "no-readme" | "no-markers" | "differs";
    };

/** The number of an id of `prefix` (`P1-S07` → 7); null for an id of another shape. */
function idNumber(prefix: string, id: string): number | null {
  const m = new RegExp(`^${prefix}-S(\\d{2,})$`, "u").exec(id);
  return m === null ? null : Number(m[1]);
}

/** The id after the highest one in `r`, at least two digits: `P1-S01` in an empty registry. */
export function nextStudyId(r: StudyRegistry): string {
  const numbers = r.studies
    .map((s) => idNumber(r.prefix, s.id))
    .filter((n): n is number => n !== null);
  const next = Math.max(0, ...numbers) + 1;
  return `${r.prefix}-S${String(next).padStart(2, "0")}`;
}

/** The slug of a title: lowercase Latin letters and digits, words joined by single hyphens; "" when none. */
export const studySlug = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

/** The number of words in a title. */
export const titleWords = (title: string): number =>
  title.split(/\s+/u).filter((w) => w !== "").length;

/** Whether `path` stays inside the folder it is relative to. */
const isInside = (path: string): boolean => {
  const n = posix.normalize(path);
  return !isAbsolute(path) && n !== ".." && !n.startsWith("../");
};

/** The ids of the rows that name `folder`. */
const idsNaming = (r: StudyRegistry, folder: string): readonly string[] =>
  r.studies.filter((s) => s.folder === folder).map((s) => s.id);

/** Whether row `i` is the first of `r` with the same value of `key`. */
const isFirst = (
  r: StudyRegistry,
  i: number,
  key: (s: Study) => string,
): boolean =>
  r.studies.findIndex((s) => key(s) === key(r.studies[i] ?? s)) === i;

/** What is wrong with the `i`th row of `r`, in a fixed order. */
function judgeRow(
  r: StudyRegistry,
  s: Study,
  i: number,
  input: StudyInput,
): readonly StudyFinding[] {
  const ids = idsNaming(r, s.folder);
  const words = titleWords(s.title);
  const missing = [
    ...(s.result === undefined ? (["result"] as const) : []),
    ...(s.result_file === undefined ? (["result_file"] as const) : []),
  ];
  const resultFile =
    s.result_file === undefined
      ? null
      : !isInside(s.result_file)
        ? ("outside" as const)
        : input.existingResults.has(`${s.folder}/${s.result_file}`)
          ? null
          : ("missing" as const);
  const successor = s.superseded_by ?? null;
  const out: readonly (StudyFinding | null)[] = [
    idNumber(r.prefix, s.id) === null
      ? { problem: "bad-id", id: s.id, prefix: r.prefix }
      : null,
    r.studies.filter((o) => o.id === s.id).length > 1 &&
    isFirst(r, i, (o) => o.id)
      ? { problem: "duplicate-id", id: s.id }
      : null,
    ids.length > 1 && isFirst(r, i, (o) => o.folder)
      ? { problem: "two-rows", folder: s.folder, ids }
      : null,
    // A bad id is reported once, as an id: the folder cannot match it.
    idNumber(r.prefix, s.id) === null ||
    (s.folder.startsWith(`${s.id}-`) &&
      STUDY_SLUG.test(s.folder.slice(s.id.length + 1)))
      ? null
      : { problem: "folder-name", id: s.id, folder: s.folder },
    input.folders.includes(s.folder)
      ? null
      : { problem: "no-folder", id: s.id, folder: s.folder },
    words > MAX_TITLE_WORDS ? { problem: "long-title", id: s.id, words } : null,
    s.status === "done" && missing.length > 0
      ? { problem: "no-result", id: s.id, missing }
      : null,
    resultFile === null || s.result_file === undefined
      ? null
      : { problem: "result-file", id: s.id, path: s.result_file, why: resultFile },
    s.status === "superseded" &&
    (successor === null || !r.studies.some((o) => o.id === successor))
      ? { problem: "no-successor", id: s.id, superseded_by: successor }
      : null,
  ];
  return out.filter((f): f is StudyFinding => f !== null);
}

/** Whether the README's index is the one `r` generates; the finding when not. */
function judgeIndex(r: StudyRegistry, readme: string | null): StudyFinding | null {
  if (readme === null) return { problem: "stale-index", why: "no-readme" };
  const block = embeddedIndex(readme);
  if (block === null) return { problem: "stale-index", why: "no-markers" };
  return block === `\n\n${studyIndex(r)}\n\n`
    ? null
    : { problem: "stale-index", why: "differs" };
}

/**
 * Every defect of a paper's study registry, in a fixed order: the registry itself; the unregistered
 * folders; each row's; the index. Pure.
 */
export function judgeStudies(input: StudyInput): readonly StudyFinding[] {
  const state = input.registry;
  if (state.kind === "absent")
    return input.folders.length === 0
      ? []
      : [{ problem: "no-registry", folders: input.folders }];
  if (state.kind === "unreadable")
    return [{ problem: "unreadable", why: state.why }];
  const r = state.registry;
  const next = nextStudyId(r);
  const index = judgeIndex(r, input.readme);
  return [
    ...input.folders
      .filter((f) => !r.studies.some((s) => s.folder === f))
      .map((folder): StudyFinding => ({ problem: "unregistered", folder, next })),
    ...r.studies.flatMap((s, i) => judgeRow(r, s, i, input)),
    ...(index === null ? [] : [index]),
  ];
}

// ── the index ─────────────────────────────────────────────────────────────────────

const HEADER = ["id", "title", "status", "result", "in paper", "folder"] as const;

/** A cell's text: one line, a pipe escaped. */
const cell = (s: string): string =>
  s.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|");

/** The cells of a study's row in the index. */
const rowCells = (s: Study): readonly string[] => [
  s.id,
  cell(s.title),
  s.status,
  cell(s.result ?? "—"),
  s.in_paper,
  `[${s.folder}/](${s.folder}/)`,
];

/** The width a cell takes: its code points. */
const widthOf = (s: string): number => [...s].length;

/**
 * The index of `r`: a markdown table, a row per study in registry order, each column padded to its
 * widest cell (at least 3), the way prettier writes a table — so formatting the README leaves it as
 * it is.
 */
export function studyIndex(r: StudyRegistry): string {
  const rows: readonly (readonly string[])[] = [
    HEADER,
    ...r.studies.map(rowCells),
  ];
  const widths = HEADER.map((_, c) =>
    Math.max(3, ...rows.map((row) => widthOf(row[c] ?? ""))),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((t, c) => t + " ".repeat((widths[c] ?? 0) - widthOf(t))).join(" | ")} |`;
  const rule = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
  return [line(HEADER), rule, ...rows.slice(1).map(line)].join("\n");
}

/** The index between its markers, a blank line on each side. */
export const indexBlock = (r: StudyRegistry): string =>
  `${INDEX_BEGIN}\n\n${studyIndex(r)}\n\n${INDEX_END}`;

/** The text between the markers of `readme`; null when it has no begin marker followed by an end one. */
export function embeddedIndex(readme: string): string | null {
  const begin = readme.indexOf(INDEX_BEGIN);
  const end = begin === -1 ? -1 : readme.indexOf(INDEX_END, begin);
  return end === -1 ? null : readme.slice(begin + INDEX_BEGIN.length, end);
}

/**
 * `readme` with its index regenerated from `r`: the block replaced in place, appended when the README
 * has none, a README of its own when there is none.
 */
export function withIndex(readme: string | null, r: StudyRegistry): string {
  if (readme === null) return `${INDEX_HEADING}\n\n${indexBlock(r)}\n`;
  const block = embeddedIndex(readme);
  if (block === null) return `${readme.trimEnd()}\n\n${indexBlock(r)}\n`;
  const begin = readme.indexOf(INDEX_BEGIN);
  const after = begin + INDEX_BEGIN.length + block.length + INDEX_END.length;
  return `${readme.slice(0, begin)}${indexBlock(r)}${readme.slice(after)}`;
}

/** The registry's text as `paperlint studies new` writes it: JSON, two-space indented, a final newline. */
export const registryText = (r: StudyRegistry): string =>
  `${JSON.stringify(r, null, 2)}\n`;

// ── the messages ──────────────────────────────────────────────────────────────────

const REGISTRY = "`repro/studies.json`";
const NEW_STUDY = '`npx paperlint studies new <paper-dir> "<title>"`';
const RUN_INDEX =
  "What to do: run `npx paperlint studies index <paper-dir>`; the block is generated, never edited by hand.";
const RENAME = "give each other row the next free id and rename its folder to match";

const tick = (s: string): string => `\`${s}\``;

/** The first part of a finding's text: what is wrong, and what to do. */
function headOf(f: StudyFinding): string {
  switch (f.problem) {
    case "no-registry":
      return `\`repro/\` holds study folders (${f.folders.map((d) => tick(`${d}/`)).join(", ")}) but no ${REGISTRY}, the registry that gives every study an id, a plain name and a status. What to do: write ${REGISTRY} with the paper's prefix — \`{ "prefix": "P1", "studies": [] }\` — then give each folder its row and rename it to \`<id>-<slug>\`; a new study is created with ${NEW_STUDY}.`;
    case "unreadable":
      return `${REGISTRY} is not a study registry: ${f.why}. Its shape is on the rule's page.`;
    case "unregistered":
      return `\`repro/${f.folder}/\` has no row in ${REGISTRY}, and every study folder has exactly one. What to do: add its row with the next free id, ${tick(f.next)}, and rename the folder to \`${f.next}-<slug>\`; a new study is created with ${NEW_STUDY}, which does both.`;
    case "no-folder":
      return `${REGISTRY}: the row ${tick(f.id)} names the folder \`repro/${f.folder}/\`, which does not exist. What to do: rename the study's folder to it, or correct the row's \`folder\`.`;
    case "two-rows":
      return `${REGISTRY}: the rows ${f.ids.map(tick).join(", ")} all name the folder \`repro/${f.folder}/\`, and a study folder has exactly one row. What to do: keep one row for it.`;
    case "bad-id":
      return `${REGISTRY}: the id ${tick(f.id)} is not \`${f.prefix}-S\` followed by two or more digits (\`${f.prefix}-S01\`). What to do: give the row the next free id and rename its folder to match.`;
    case "duplicate-id":
      return `${REGISTRY}: the id ${tick(f.id)} is on more than one row, and an id names one study. What to do: ${RENAME}.`;
    case "folder-name":
      return `${REGISTRY}: the row ${tick(f.id)} names the folder ${tick(f.folder)}, which is not \`${f.id}-<slug>\` — the id, then lowercase letters and digits in words joined by hyphens. What to do: rename the folder and the row's \`folder\` together.`;
    case "long-title":
      return `${REGISTRY}: the title of ${tick(f.id)} has ${String(f.words)} words; a title is a plain name of at most ${String(MAX_TITLE_WORDS)}. What to do: shorten it, and put the detail in \`question\`.`;
    case "no-result":
      return `${REGISTRY}: ${tick(f.id)} is \`done\` without ${f.missing.map(tick).join(" and ")}. What to do: write the one-line result and the file it is read from (\`result\`, \`result_file\`), or set the status it really has.`;
    case "result-file":
      return `${REGISTRY}: the \`result_file\` of ${tick(f.id)}, ${tick(f.path)}, ${f.why === "missing" ? "is not a file in its folder" : "is outside its folder"}. What to do: name a file that exists, relative to the study's folder.`;
    case "no-successor":
      return `${REGISTRY}: ${tick(f.id)} is \`superseded\` ${f.superseded_by === null ? "without `superseded_by`" : `by ${tick(f.superseded_by)}, which is no study in the registry`}. What to do: name the id of the study that replaced it.`;
    case "stale-index":
      return f.why === "differs"
        ? `The index in \`repro/README.md\` (between the \`studies:begin\` and \`studies:end\` markers) is not the one ${REGISTRY} generates. ${RUN_INDEX}`
        : f.why === "no-markers"
          ? `\`repro/README.md\` has no index of the studies (the \`studies:begin\` and \`studies:end\` markers). ${RUN_INDEX}`
          : `\`repro/README.md\`, the index of the studies, does not exist. ${RUN_INDEX}`;
  }
}

/** The one text a finding is reported with: what is wrong, what to do, and the rule's page. */
export const studyMessage = (f: StudyFinding): string =>
  `${headOf(f)}\nRule repro/study-registered: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-registered.md`;
