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
import { isAbsolute, posix, win32 } from "node:path";
import { STUDIES_FILE, STUDY_SLUG } from "./repro-layout.ts";
import { needsMode, type StudyMode } from "./study-mode.ts";

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

/** What a measurement is to the paper: the claim it carries, or what that claim is compared with. */
export const MEASUREMENT_ROLES = ["headline", "baseline"] as const;
export type MeasurementRole = (typeof MEASUREMENT_ROLES)[number];

/**
 * The statuses of a study that has run: its plan was due before the first run. A `designing` study
 * has not run yet, and a `dropped` one never will.
 */
export const RAN_STATUSES: readonly StudyStatus[] = [
  "running",
  "done",
  "stopped",
  "superseded",
];

/** A requirement of the author's on the paper's measurements, in their words. */
export interface Requirement {
  readonly id: string;
  /** The author's words, verbatim. */
  readonly text: string;
  readonly date: string;
  /** Where they said it: a chat, a message, a review comment. */
  readonly source: string;
}

/** Someone's approval, in their words: of a measurement, or of a study's drawn units. */
export interface Approval {
  readonly by: string;
  readonly date: string;
  readonly quote: string;
  readonly source?: string | undefined;
}

/**
 * One measurement: what the paper measures, made of one or more studies (a pilot, the main run, a
 * replication) whose rows name it in `measurement`. A measurement may carry more fields.
 */
export interface Measurement {
  readonly id: string;
  readonly title: string;
  /** The research question it answers. */
  readonly rq?: string | undefined;
  readonly role: MeasurementRole;
  readonly approval?: Approval | undefined;
  /** The ids of the requirements it must meet. */
  readonly requirements?: readonly string[] | undefined;
  readonly [extra: string]: unknown;
}

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
  /** The id of the measurement the study belongs to. */
  readonly measurement?: string | undefined;
  /** The study's plan: a path inside its folder, `plan.json`. */
  readonly plan?: string | undefined;
  readonly [extra: string]: unknown;
}

export interface StudyRegistry {
  readonly prefix: string;
  /** The paper's author: the one person whose approval makes a measurement the headline. */
  readonly author?: string | undefined;
  readonly requirements?: readonly Requirement[] | undefined;
  /** When present, every row's `measurement` names one of them. */
  readonly measurements?: readonly Measurement[] | undefined;
  readonly studies: readonly Study[];
}

/** The file `paperlint studies new` writes a study's plan to, beside its README.md. */
export const PLAN_FILE = "plan.json";

/** The plan's name before it was a plan: still read as one, and reported by `repro/study-plan-name`. */
export const LEGACY_PLAN_FILE = "prereg.json";

/** The author's check of a study's drawn units, before the runs. */
export type AuthorCheck = Omit<Approval, "source">;

/**
 * A study's plan, fixed before its runs: what it measures, on what population and how it is drawn,
 * its arms, its primary outcome, and the author's check of the drawn units. Closed: a key the paper
 * needs of its own goes in `extra`, so a misspelt key is an error, not a key nobody reads. "Not
 * known" and "not yet" have one spelling each: null.
 */
export interface StudyPlan {
  readonly question: string;
  readonly population: {
    /** Where the units come from: the census, crawl or registry, with its date. */
    readonly source: string;
    readonly draw: Draw;
  };
  /** The conditions compared, each name once; none for a census. */
  readonly arms: readonly { readonly name: string }[];
  readonly primary_outcome: string;
  /** null: the author has not checked the drawn units yet. Only a ready plan carries one. */
  readonly author_check: AuthorCheck | null;
  /** The paper's own keys: hypotheses, models, budget … Kept, never read; none is a plan field. */
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
  /**
   * How the outcomes are kept from the decisions on the inputs: decided before the run, blind, or
   * exploratory (src/domain/study-mode.ts). A measurement study's plan is not ready without it.
   */
  readonly mode?: StudyMode | undefined;
}

/**
 * How the sample is drawn from the population: a seeded draw, whose seed is part of it, or all of
 * the population (a census), which has none. The size of the population is not stored: it is
 * counted from the source, and a stored copy would only contradict it.
 */
export type Draw =
  | {
      readonly kind: "seeded";
      /** `random`, `stratified` … */
      readonly method: string;
      readonly seed: string | number;
    }
  | {
      readonly kind: "all";
      /** `census` … */
      readonly method: string;
    };

/** The top-level fields of a plan: none of them may be a key of `extra`. */
export const PLAN_FIELDS = [
  "question",
  "population",
  "arms",
  "primary_outcome",
  "author_check",
  "extra",
  "mode",
] as const;

/** A plan with empty required texts: the author has not approved it. */
export type DraftPlan = StudyPlan & { readonly author_check: null };

/** The texts a plan must fill before the study runs, in the order they are named. */
export const PLAN_TEXT_FIELDS = [
  "question",
  "population.source",
  "population.draw.method",
  "primary_outcome",
  "mode",
  "mode.outputs",
  "mode.decision.file",
  "mode.decision.note",
  "mode.unseal_after.file",
  "mode.unseal_after.note",
  "mode.reason",
] as const;
export type PlanTextField = (typeof PLAN_TEXT_FIELDS)[number];

/**
 * A plan's text, parsed: ready (every required text filled), a draft (its empty texts named, and
 * no check of the author's: only a complete plan is approved), or the reasons it is not a plan. Whether a plan is complete is decided here, once, by the parser.
 */
export type ParsedPlan =
  | { readonly kind: "ready"; readonly plan: StudyPlan }
  | {
      readonly kind: "draft";
      readonly plan: DraftPlan;
      readonly empty: readonly PlanTextField[];
    }
  | { readonly kind: "unreadable"; readonly why: string };

/** What a study's folder holds of the plan its row names: absent, or what its text parsed to. */
export type PlanState = { readonly kind: "absent" } | ParsedPlan;

/** The decision file `paperlint studies new` names for a study in `folder`, relative to the paper. */
export const decisionPath = (folder: string): string =>
  `repro/${folder}/${DECISION_FILE}`;

/** The decision file's name, beside the plan. */
export const DECISION_FILE = "decision.md";

/**
 * The plan `paperlint studies new` writes for a study of `kind` in `folder`: every field present, its
 * value to fill. Its draw is of all the population (a census); a sampled study changes it to
 * `{ "kind": "seeded", "method", "seed" }`. A study that must declare its mode gets the default one,
 * decided before the run, its decision file named and its outputs and note to fill.
 */
export const planTemplate = (kind: StudyKind, folder: string): DraftPlan => ({
  question: "",
  population: { source: "", draw: { kind: "all", method: "" } },
  arms: [],
  primary_outcome: "",
  author_check: null,
  ...(needsMode(kind)
    ? {
        mode: {
          kind: "decide_before_run",
          outputs: [],
          decision: { file: decisionPath(folder), note: "" },
        },
      }
    : {}),
});

/** A plan's text as `paperlint studies new` writes it: JSON, two-space indented, a final newline. */
export const planText = (p: StudyPlan): string =>
  `${JSON.stringify(p, null, 2)}\n`;

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
  /** The plan each row names, by `<folder>/<plan>`; one not listed is absent. */
  readonly plans: ReadonlyMap<string, PlanState>;
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
  | {
      readonly problem: "no-folder";
      readonly id: string;
      readonly folder: string;
    }
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
  | {
      readonly problem: "long-title";
      readonly id: string;
      readonly words: number;
    }
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
    }
  | {
      readonly problem: "unknown-measurement";
      readonly id: string;
      readonly measurement: string;
    }
  | { readonly problem: "empty-measurement"; readonly measurement: string }
  | {
      readonly problem: "unknown-requirement";
      readonly measurement: string;
      readonly requirement: string;
    }
  | {
      readonly problem: "headline-approval";
      readonly measurement: string;
      readonly why: "missing";
      readonly author: string | null;
    }
  | {
      readonly problem: "headline-approval";
      readonly measurement: string;
      readonly why: "not-author";
      readonly by: string;
      readonly author: string;
    }
  | {
      readonly problem: "bad-plan";
      readonly id: string;
      readonly path: string;
      readonly why: "missing" | "outside";
    }
  | {
      readonly problem: "bad-plan";
      readonly id: string;
      readonly path: string;
      readonly why: "unreadable";
      readonly reasons: string;
    }
  | {
      readonly problem: "bad-plan";
      readonly id: string;
      readonly path: string;
      readonly why: "unfilled";
      readonly fields: readonly PlanTextField[];
      readonly status: StudyStatus;
    }
  | {
      readonly problem: "author-check";
      readonly id: string;
      readonly measurement: string;
      readonly status: StudyStatus;
      readonly why: "no-plan" | "missing";
    }
  | {
      readonly problem: "author-check";
      readonly id: string;
      readonly measurement: string;
      readonly status: StudyStatus;
      readonly why: "not-author";
      readonly by: string;
      readonly author: string;
    }
  | {
      readonly problem: "legacy-plan";
      readonly id: string;
      readonly path: string;
    };

/** The findings `repro/study-plan-name` reports, a warning; every other is `repro/study-registered`'s. */
export const PLAN_NAME_PROBLEMS: readonly StudyFinding["problem"][] = [
  "legacy-plan",
];

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

/**
 * Whether `path` stays inside the folder it is relative to. A backslash or a Windows absolute path
 * is refused outright: `posix.normalize` does not resolve `..\\`, while the host's `join` may.
 */
const isInside = (path: string): boolean => {
  if (path.includes("\\") || isAbsolute(path) || win32.isAbsolute(path))
    return false;
  const n = posix.normalize(path);
  return n !== ".." && !n.startsWith("../");
};

/**
 * The `<folder>/<plan>` of each row whose plan lies inside its folder: the files the judge needs read
 * (`StudyInput.plans`). A plan outside its folder is reported without being read.
 */
export const planKeys = (r: StudyRegistry): readonly string[] =>
  planRefs(r).map((p) => p.key);

/** Each plan `planKeys` names, with the kind of the study whose row names it: what its parser needs. */
export const planRefs = (
  r: StudyRegistry,
): readonly { readonly key: string; readonly kind: StudyKind }[] =>
  r.studies.flatMap((s) =>
    s.plan !== undefined && isInside(s.plan)
      ? [{ key: `${s.folder}/${s.plan}`, kind: s.kind }]
      : [],
  );

/** One row of a registry, with what the judge read beside it. */
interface Row {
  readonly r: StudyRegistry;
  readonly s: Study;
  readonly i: number;
  readonly input: StudyInput;
}

/** One check of a row: its finding, or null. */
type RowCheck = (row: Row) => StudyFinding | null;

/** Whether the row is the first of the registry with its value of `key`. */
const isFirst = ({ r, s, i }: Row, key: (o: Study) => string): boolean =>
  r.studies.findIndex((o) => key(o) === key(s)) === i;

const badId: RowCheck = ({ r, s }) =>
  idNumber(r.prefix, s.id) === null
    ? { problem: "bad-id", id: s.id, prefix: r.prefix }
    : null;

/** Reported once, on the first row that holds the id. */
const duplicateId: RowCheck = (row) =>
  row.r.studies.filter((o) => o.id === row.s.id).length > 1 &&
  isFirst(row, (o) => o.id)
    ? { problem: "duplicate-id", id: row.s.id }
    : null;

/** Reported once, on the first row that names the folder. */
const twoRows: RowCheck = (row) => {
  const { r, s } = row;
  const ids = r.studies.filter((o) => o.folder === s.folder).map((o) => o.id);
  return ids.length > 1 && isFirst(row, (o) => o.folder)
    ? { problem: "two-rows", folder: s.folder, ids }
    : null;
};

/** A bad id is reported once, as an id: no folder can match it. */
const folderName: RowCheck = ({ r, s }) =>
  idNumber(r.prefix, s.id) === null ||
  (s.folder.startsWith(`${s.id}-`) &&
    STUDY_SLUG.test(s.folder.slice(s.id.length + 1)))
    ? null
    : { problem: "folder-name", id: s.id, folder: s.folder };

const noFolder: RowCheck = ({ s, input }) =>
  input.folders.includes(s.folder)
    ? null
    : { problem: "no-folder", id: s.id, folder: s.folder };

const longTitle: RowCheck = ({ s }) => {
  const words = titleWords(s.title);
  return words > MAX_TITLE_WORDS
    ? { problem: "long-title", id: s.id, words }
    : null;
};

const noResult: RowCheck = ({ s }) => {
  const missing = [
    ...(s.result === undefined ? (["result"] as const) : []),
    ...(s.result_file === undefined ? (["result_file"] as const) : []),
  ];
  return s.status === "done" && missing.length > 0
    ? { problem: "no-result", id: s.id, missing }
    : null;
};

/** A `result_file` on any status must be a file inside the study's folder. */
const resultFile: RowCheck = ({ s, input }) => {
  const path = s.result_file;
  if (path === undefined) return null;
  if (!isInside(path))
    return { problem: "result-file", id: s.id, path, why: "outside" };
  return input.existingResults.has(`${s.folder}/${path}`)
    ? null
    : { problem: "result-file", id: s.id, path, why: "missing" };
};

const noSuccessor: RowCheck = ({ r, s }) => {
  const by = s.superseded_by ?? null;
  return s.status === "superseded" &&
    (by === null || !r.studies.some((o) => o.id === by))
    ? { problem: "no-successor", id: s.id, superseded_by: by }
    : null;
};

/** A row's `measurement`, when the registry declares its measurements, names one of them. */
const unknownMeasurement: RowCheck = ({ r, s }) =>
  r.measurements === undefined ||
  s.measurement === undefined ||
  r.measurements.some((m) => m.id === s.measurement)
    ? null
    : { problem: "unknown-measurement", id: s.id, measurement: s.measurement };

/** The state of the plan the row names (absent when outside its folder); null when it names none. */
const planOf = ({ s, input }: Row): PlanState | null => {
  if (s.plan === undefined) return null;
  return isInside(s.plan)
    ? (input.plans.get(`${s.folder}/${s.plan}`) ?? { kind: "absent" })
    : { kind: "absent" };
};

const hasRun = (s: Study): boolean => RAN_STATUSES.includes(s.status);

/** The finding for the plan `path` of `s`, in the state its folder holds it; null when it stands. */
const planFinding = (
  s: Study,
  path: string,
  state: PlanState,
): StudyFinding | null => {
  const at = { problem: "bad-plan", id: s.id, path } as const;
  switch (state.kind) {
    case "absent":
      return { ...at, why: "missing" };
    case "unreadable":
      return { ...at, why: "unreadable", reasons: state.why };
    case "draft":
      return hasRun(s)
        ? { ...at, why: "unfilled", fields: state.empty, status: s.status }
        : null;
    case "ready":
      return null;
  }
};

/** The plan a row names is a file inside its folder, of the schema, and ready once the study has run. */
const badPlan: RowCheck = ({ s, input }) => {
  const path = s.plan;
  if (path === undefined) return null;
  if (!isInside(path))
    return { problem: "bad-plan", id: s.id, path, why: "outside" };
  return planFinding(
    s,
    path,
    input.plans.get(`${s.folder}/${path}`) ?? { kind: "absent" },
  );
};

/** A plan under its old name: read, and named for renaming. */
const legacyPlan: RowCheck = ({ s }) =>
  s.plan !== undefined && posix.basename(s.plan) === LEGACY_PLAN_FILE
    ? { problem: "legacy-plan", id: s.id, path: s.plan }
    : null;

/**
 * A study of a headline measurement that has run carries the author's check of its drawn units in
 * its plan, by the registry's author when it names one. A plan that cannot be read is `badPlan`'s.
 */
const authorCheck: RowCheck = (row) => {
  const { r, s } = row;
  const m = r.measurements?.find((o) => o.id === s.measurement);
  if (m?.role !== "headline" || !hasRun(s)) return null;
  const at = {
    problem: "author-check",
    id: s.id,
    measurement: m.id,
    status: s.status,
  } as const;
  const state = planOf(row);
  if (state === null) return { ...at, why: "no-plan" };
  const wrong =
    state.kind === "ready" || state.kind === "draft"
      ? checkProblem(r, state.plan)
      : null;
  return wrong === null ? null : { ...at, ...wrong };
};

/** What a read plan's author check lacks: it is not there, or it is not the registry's author's. */
const checkProblem = (
  r: StudyRegistry,
  plan: StudyPlan,
):
  | { readonly why: "missing" }
  | { readonly why: "not-author"; readonly by: string; readonly author: string }
  | null => {
  const check = plan.author_check;
  if (check === null) return { why: "missing" };
  return r.author === undefined || check.by === r.author
    ? null
    : { why: "not-author", by: check.by, author: r.author };
};

/** The checks of a row, in the order their findings are reported. */
const ROW_CHECKS: readonly RowCheck[] = [
  badId,
  duplicateId,
  twoRows,
  folderName,
  noFolder,
  longTitle,
  noResult,
  resultFile,
  noSuccessor,
  unknownMeasurement,
  badPlan,
  legacyPlan,
  authorCheck,
];

/** A headline measurement's approval: missing, or not the registry's author's; null when it stands. */
const headlineApproval = (
  r: StudyRegistry,
  m: Measurement,
): StudyFinding | null => {
  if (m.role !== "headline") return null;
  const author = r.author ?? null;
  if (m.approval === undefined)
    return {
      problem: "headline-approval",
      measurement: m.id,
      why: "missing",
      author,
    };
  return author === null || m.approval.by === author
    ? null
    : {
        problem: "headline-approval",
        measurement: m.id,
        why: "not-author",
        by: m.approval.by,
        author,
      };
};

/** What is wrong with one measurement: no study, a requirement not held, a headline not approved. */
const judgeMeasurement = (
  r: StudyRegistry,
  m: Measurement,
): readonly StudyFinding[] => {
  const approval = headlineApproval(r, m);
  return [
    ...(r.studies.some((s) => s.measurement === m.id)
      ? []
      : [{ problem: "empty-measurement", measurement: m.id } as const]),
    ...(m.requirements ?? [])
      .filter((id) => !(r.requirements ?? []).some((q) => q.id === id))
      .map((requirement): StudyFinding => ({
        problem: "unknown-requirement",
        measurement: m.id,
        requirement,
      })),
    ...(approval === null ? [] : [approval]),
  ];
};

/** What is wrong with a row, in a fixed order. */
const judgeRow = (row: Row): readonly StudyFinding[] =>
  ROW_CHECKS.map((check) => check(row)).filter(
    (f): f is StudyFinding => f !== null,
  );

/** Whether the README's index is the one `r` generates; the finding when not. */
function judgeIndex(
  r: StudyRegistry,
  readme: string | null,
): StudyFinding | null {
  if (readme === null) return { problem: "stale-index", why: "no-readme" };
  const block = embeddedIndex(readme);
  if (block === null) return { problem: "stale-index", why: "no-markers" };
  return indexInSync(readme, r)
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
      .map((folder): StudyFinding => ({
        problem: "unregistered",
        folder,
        next,
      })),
    ...r.studies.flatMap((s, i) => judgeRow({ r, s, i, input })),
    ...(r.measurements ?? []).flatMap((m) => judgeMeasurement(r, m)),
    ...(index === null ? [] : [index]),
  ];
}

// ── the index ─────────────────────────────────────────────────────────────────────

/** A cell's text: one line, a backslash and then a pipe escaped, so `a\\|b` stays one cell. */
const cell = (s: string): string =>
  s.replace(/\r?\n/gu, " ").replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|");

/** The columns of the index: each one's header, and its cell for a study. */
const COLUMNS: readonly {
  readonly head: string;
  readonly of: (s: Study) => string;
}[] = [
  { head: "id", of: (s) => s.id },
  { head: "title", of: (s) => cell(s.title) },
  { head: "status", of: (s) => s.status },
  { head: "result", of: (s) => cell(s.result ?? "—") },
  { head: "in paper", of: (s) => s.in_paper },
  { head: "folder", of: (s) => `[${s.folder}/](${s.folder}/)` },
];

/** The width a cell takes: its code points. */
const widthOf = (s: string): number => Array.from(s).length;

/** `t` padded to `width`. */
const padded = (t: string, width: number): string =>
  t + " ".repeat(width - widthOf(t));

/**
 * The index of `r`: a markdown table, a row per study in registry order, each column padded to its
 * widest cell (at least 3), the way prettier writes a table — so formatting the README leaves it as
 * it is.
 */
export function studyIndex(r: StudyRegistry): string {
  const sized = COLUMNS.map((c) => ({
    ...c,
    width: Math.max(
      3,
      widthOf(c.head),
      ...r.studies.map((s) => widthOf(c.of(s))),
    ),
  }));
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [
    line(sized.map((c) => padded(c.head, c.width))),
    line(sized.map((c) => "-".repeat(c.width))),
    ...r.studies.map((s) => line(sized.map((c) => padded(c.of(s), c.width)))),
  ].join("\n");
}

/**
 * What a markdown table says, whatever its padding: its rows, each cell trimmed, a separator cell as
 * `---`. The index is judged on this, because the padding belongs to the formatter: prettier sizes a
 * column by display width, so a wide character pads differently from a code-point count.
 */
const cellsOf = (table: string): string =>
  table
    .trim()
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/gu, "")
        .split(/(?<!\\)\|/u)
        .map((c) => c.trim().replace(/^:?-{3,}:?$/u, "---"))
        .join("|"),
    )
    .join("\n");

/** Whether `readme` holds the index of `r`, whatever padding a formatter gave its table. */
export function indexInSync(readme: string | null, r: StudyRegistry): boolean {
  const block = readme === null ? null : embeddedIndex(readme);
  return block !== null && cellsOf(block) === cellsOf(studyIndex(r));
}

/** The index between its markers, a blank line on each side. */
export const indexBlock = (r: StudyRegistry): string =>
  `${INDEX_BEGIN}\n\n${studyIndex(r)}\n\n${INDEX_END}`;

/**
 * Where `marker` stands alone on a line of `text`, at or after `from`; -1 when it does not. A marker
 * counts only there, where the generator writes it: prose can mention it and a cell can carry it, but
 * neither puts it alone on a line.
 */
const markerAt = (text: string, marker: string, from = 0): number => {
  const literal = marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const m = new RegExp(`^${literal}$`, "mu").exec(text.slice(from));
  return m === null ? -1 : from + m.index;
};

/** The text between the markers of `readme`; null when it has no begin marker followed by an end one. */
export function embeddedIndex(readme: string): string | null {
  const begin = markerAt(readme, INDEX_BEGIN);
  const end = begin === -1 ? -1 : markerAt(readme, INDEX_END, begin);
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
  const begin = markerAt(readme, INDEX_BEGIN);
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
const RENAME =
  "give each other row the next free id and rename its folder to match";

const tick = (s: string): string => `\`${s}\``;

/** `a`, `b` and `c`: names in backticks, the last joined by "and". */
const listed = (names: readonly string[]): string => {
  const t = names.map(tick);
  return [t.slice(0, -1).join(", "), ...t.slice(-1)]
    .filter((part) => part !== "")
    .join(" and ");
};

/** Each finding by its problem: the map the messages are looked up in. */
type FindingOf = {
  readonly [F in StudyFinding as F["problem"]]: F;
};
type Problem = keyof FindingOf;

const STALE_HEAD: Readonly<Record<FindingOf["stale-index"]["why"], string>> = {
  differs: `The index in \`repro/README.md\` (between the \`studies:begin\` and \`studies:end\` markers) is not the one ${REGISTRY} generates.`,
  "no-markers":
    "`repro/README.md` has no index of the studies (the `studies:begin` and `studies:end` markers).",
  "no-readme": "`repro/README.md`, the index of the studies, does not exist.",
};

/** The first part of each finding's text: what is wrong, and what to do. */
const HEADS: { readonly [P in Problem]: (f: FindingOf[P]) => string } = {
  "no-registry": (f) =>
    `\`repro/\` holds study folders (${f.folders.map((d) => tick(`${d}/`)).join(", ")}) but no ${REGISTRY}, the registry that gives every study an id, a plain name and a status. What to do: write ${REGISTRY} with the paper's prefix — \`{ "prefix": "P1", "studies": [] }\` — then give each folder its row and rename it to \`<id>-<slug>\`; a new study is created with ${NEW_STUDY}.`,
  unreadable: (f) =>
    `${REGISTRY} is not a study registry: ${f.why}. Its shape is on the rule's page.`,
  unregistered: (f) =>
    `\`repro/${f.folder}/\` has no row in ${REGISTRY}, and every study folder has exactly one. What to do: add its row with the next free id, ${tick(f.next)}, and rename the folder to \`${f.next}-<slug>\`; a new study is created with ${NEW_STUDY}, which does both.`,
  "no-folder": (f) =>
    `${REGISTRY}: the row ${tick(f.id)} names the folder \`repro/${f.folder}/\`, which does not exist. What to do: rename the study's folder to it, or correct the row's \`folder\`.`,
  "two-rows": (f) =>
    `${REGISTRY}: the rows ${f.ids.map(tick).join(", ")} all name the folder \`repro/${f.folder}/\`, and a study folder has exactly one row. What to do: keep one row for it.`,
  "bad-id": (f) =>
    `${REGISTRY}: the id ${tick(f.id)} is not \`${f.prefix}-S\` followed by two or more digits (\`${f.prefix}-S01\`). What to do: give the row the next free id and rename its folder to match.`,
  "duplicate-id": (f) =>
    `${REGISTRY}: the id ${tick(f.id)} is on more than one row, and an id names one study. What to do: ${RENAME}.`,
  "folder-name": (f) =>
    `${REGISTRY}: the row ${tick(f.id)} names the folder ${tick(f.folder)}, which is not \`${f.id}-<slug>\` — the id, then lowercase letters and digits in words joined by hyphens. What to do: rename the folder and the row's \`folder\` together.`,
  "long-title": (f) =>
    `${REGISTRY}: the title of ${tick(f.id)} has ${String(f.words)} words; a title is a plain name of at most ${String(MAX_TITLE_WORDS)}. What to do: shorten it, and put the detail in \`question\`.`,
  "no-result": (f) =>
    `${REGISTRY}: ${tick(f.id)} is \`done\` without ${f.missing.map(tick).join(" and ")}. What to do: write the one-line result and the file it is read from (\`result\`, \`result_file\`), or set the status it really has.`,
  "result-file": (f) =>
    `${REGISTRY}: the \`result_file\` of ${tick(f.id)}, ${tick(f.path)}, ${f.why === "missing" ? "is not a file in its folder" : "is outside its folder"}. What to do: name a file that exists, relative to the study's folder.`,
  "no-successor": (f) =>
    `${REGISTRY}: ${tick(f.id)} is \`superseded\` ${f.superseded_by === null ? "without `superseded_by`" : `by ${tick(f.superseded_by)}, which is no study in the registry`}. What to do: name the id of the study that replaced it.`,
  "stale-index": (f) => `${STALE_HEAD[f.why]} ${RUN_INDEX}`,
  "unknown-measurement": (f) =>
    `${REGISTRY}: the row ${tick(f.id)} names the measurement ${tick(f.measurement)}, which is not in \`measurements\`. What to do: add the measurement to \`measurements\`, or correct the row's \`measurement\`.`,
  "empty-measurement": (f) =>
    `${REGISTRY}: no row names the measurement ${tick(f.measurement)}, and a measurement is made of studies. What to do: set \`"measurement": "${f.measurement}"\` on the rows of its studies, or remove the measurement.`,
  "unknown-requirement": (f) =>
    `${REGISTRY}: the measurement ${tick(f.measurement)} must meet the requirement ${tick(f.requirement)}, which is not in \`requirements\`. What to do: add the requirement — the author's words verbatim in \`text\`, with its \`date\` and \`source\` — or correct the measurement's \`requirements\`.`,
  "headline-approval": (f) =>
    f.why === "missing"
      ? `${REGISTRY}: the measurement ${tick(f.measurement)} is a \`headline\` one and has no \`approval\`. What to do: record ${f.author === null ? "the author's approval" : `the approval of ${f.author}, the registry's \`author\``} — \`by\`, \`date\`, and their words in \`quote\` — or make it a \`baseline\`.`
      : `${REGISTRY}: the measurement ${tick(f.measurement)} is a \`headline\` one, and its \`approval\` is by ${f.by}, not by the registry's \`author\`, ${f.author}. What to do: only the author approves a headline measurement; record their own approval.`,
  "bad-plan": (f) => {
    const of = `the \`plan\` of ${tick(f.id)}, ${tick(f.path)},`;
    const plan = `The plan of ${tick(f.id)}, ${tick(f.path)} in its folder,`;
    switch (f.why) {
      case "missing":
        return `${REGISTRY}: ${of} is not a file in its folder. What to do: write the plan there (its fields are on the rule's page), or correct the row's \`plan\`.`;
      case "outside":
        return `${REGISTRY}: ${of} is outside its folder. What to do: keep the plan in the study's folder, as \`${PLAN_FILE}\`, and name it relative to the folder.`;
      case "unreadable":
        return `${plan} is not a study plan: ${f.reasons}. What to do: give it the fields on the rule's page — \`question\`, \`population\`, \`arms\`, \`primary_outcome\`.`;
      case "unfilled":
        return `${plan} leaves ${listed(f.fields)} empty, and the study is ${tick(f.status)}: a plan is written before the runs. What to do: fill them in, or set the study back to \`designing\`.`;
    }
  },
  "author-check": (f) => {
    const head = `${tick(f.id)} is ${tick(f.status)} in the headline measurement ${tick(f.measurement)}, and`;
    switch (f.why) {
      case "no-plan":
        return `${head} its row names no plan to hold the author's check of the drawn units. What to do: write its plan (\`${PLAN_FILE}\` in its folder, named in the row's \`plan\`) with \`author_check\` — \`by\`, \`date\`, and the author's words in \`quote\`.`;
      case "missing":
        return `${head} its plan has no \`author_check\`. What to do: show the author the drawn units, then record their answer in the plan's \`author_check\` — \`by\`, \`date\`, and their words in \`quote\`.`;
      case "not-author":
        return `${head} the \`author_check\` in its plan is by ${f.by}, not by the registry's \`author\`, ${f.author}. What to do: only the author approves the drawn units of a headline measurement; record their own answer.`;
    }
  },
  "legacy-plan": (f) =>
    `The plan of ${tick(f.id)} is ${tick(f.path)}, its old name; it is read as the plan. What to do: rename it to \`${PLAN_FILE}\` in the study's folder (\`git mv\`) and set the row's \`plan\` to \`${PLAN_FILE}\`.`,
};

/** The head of finding `f` of problem `p`: the lookup, typed by the problem. */
const headOf = <P extends Problem>(p: P, f: FindingOf[P]): string =>
  HEADS[p](f);

/** The rule that reports finding `f`. */
const ruleOf = (f: StudyFinding): string =>
  PLAN_NAME_PROBLEMS.includes(f.problem)
    ? "repro/study-plan-name"
    : "repro/study-registered";

/** The one text a finding is reported with: what is wrong, what to do, and the rule's page. */
export const studyMessage = (f: StudyFinding): string =>
  `${headOf(f.problem, f)}\nRule ${ruleOf(f)}: https://github.com/zernie/paperlint/blob/main/docs/rules/${ruleOf(f)}.md`;

// ── a new study ───────────────────────────────────────────────────────────────────

/** Whether `s` names a kind of study. */
export const isStudyKind = (s: string): s is StudyKind =>
  STUDY_KINDS.some((k) => k === s);

/** What a new study is made from. */
export interface NewStudy {
  readonly title: string;
  readonly kind: StudyKind;
  /** The day it is registered, `YYYY-MM-DD`. */
  readonly date: string;
}

/** Why `title` cannot name a study; null when it can. */
function titleProblem(title: string): string | null {
  const words = titleWords(title);
  if (words === 0) return "the title is empty";
  if (words > MAX_TITLE_WORDS)
    return `the title has ${String(words)} words; a title is a plain name of at most ${String(MAX_TITLE_WORDS)} — the detail goes in the row's \`question\``;
  return studySlug(title) === ""
    ? "the title has no Latin letter or digit to name the folder by; give it one (an English title, or a word such as the method's name)"
    : null;
}

/** A registry with a study added, and the study; or why it could not be. */
export type Added =
  | {
      readonly ok: true;
      readonly registry: StudyRegistry;
      readonly study: Study;
    }
  | { readonly ok: false; readonly why: string };

/**
 * `r` with a new study appended: the next id, the folder `<id>-<slug>`, `status: designing`,
 * `in_paper: no`, an empty question and its plan, `plan.json`; or why the title cannot make one.
 */
export function addStudy(r: StudyRegistry, n: NewStudy): Added {
  const title = n.title.trim().replace(/\s+/gu, " ");
  const why = titleProblem(title);
  if (why !== null) return { ok: false, why };
  const id = nextStudyId(r);
  const study: Study = {
    id,
    folder: `${id}-${studySlug(title)}`,
    title,
    question: "",
    kind: n.kind,
    status: "designing",
    date: n.date,
    in_paper: "no",
    plan: PLAN_FILE,
  };
  return {
    ok: true,
    registry: { ...r, studies: [...r.studies, study] },
    study,
  };
}

/** The `README.md` a new study's folder starts with: its id and title in frontmatter, then the sections. */
export const studyReadme = (s: Study): string =>
  [
    "---",
    `id: ${s.id}`,
    `title: ${JSON.stringify(s.title)}`,
    "---",
    "",
    `# ${s.id} — ${s.title}`,
    "",
    `Its row in \`../${STUDIES_FILE}\` holds its status. When the study ends, set \`status\`, \`result\`,`,
    "`result_file` and `in_paper` there, then run `npx paperlint studies index <paper-dir>`.",
    "",
    `Its plan is \`${PLAN_FILE}\`: what it measures, the population and the draw, the arms and the primary`,
    "outcome, filled in before the first run; the author's check of the drawn units goes in its",
    "`author_check`.",
    "",
    "## Question",
    "",
    "## How to run",
    "",
    "## Result",
    "",
  ].join("\n");
