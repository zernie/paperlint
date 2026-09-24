import type { RuleBlock } from "./rules-config.ts";

/**
 * The shapes the CLI commands exchange. Before the move to TypeScript this was all `{}` and lived
 * in someone's head: a typo in a config key read as "field not set", not as an error.
 */

/** The contents of the consumer's `rpp.json`. */
export interface RppConfig {
  /** 🔴 REQUIRED. The paper director(ies), relative to the config file ITSELF. The field name is
   * `PAPERS_DIR_FIELD` in lib/paper-config.mjs; code reads it through `papersDirOf()` in cli.ts. */
  papersDir?: string | string[];
  /** The command that prints the author list from .bib — each corpus has its own. */
  authorListCommand?: string;
  /** Per-paper typography debt: how many findings already exist; the number may only go down. */
  typographyDebt?: Record<string, Record<string, number>>;
  /** Frontmatter fields required for review notes, and the permitted values of each. */
  docFields?: Record<string, { values: string[] }>;
  /** Ignore review findings older than this date. */
  reviewSince?: string;
  /** How many findings a cold read must produce to count as a cold read. */
  minFindings?: number;
  /** The word with which review notes introduce the cause. */
  causeMarker?: string;
  /** Which files a paper directory must carry; `false` turns the check off entirely. */
  structure?: StructureConfig | false;
  /** REMOVED — `rpp build` compiles the paper itself. Still typed so a leftover key can be named. */
  buildScripts?: unknown;
  /** ESLint config blocks appended after rpp's own — PARSED by `parseSettings` in cli.ts. */
  rules?: readonly RuleBlock[];
}

export interface StructureConfig {
  /** These files are what IDENTIFY a directory as a paper. Detection is generous. */
  markers?: string[];
  /** These files must exist. The requirements are strict. */
  require?: string[];
  /** At least one from each group. */
  requireOneOf?: string[][];
  /** Directories exempted from the check by name. */
  ignore?: string[];
}

/** The parsed command line. */
export interface Args {
  cmd: string | null;
  paths: string[];
  config: string | null;
  json: boolean;
  all: boolean;
  dryRun: boolean;
  /** `--check`: `toolchain` reports what is missing and changes nothing. */
  check: boolean;
  maxWarnings: number;
  /** `--yes` / `-y`: take every default, ask nothing. */
  yes: boolean;
  /** `--no-hooks`: `init` does not touch `.claude/settings.json`. */
  noHooks: boolean;
  /** `--paper <name>`: `init` creates this paper. */
  paper: string | null;
  /** `--format tex|md` for `new` and `init --paper`. Validated by the command, not here. */
  format: string | null;
  /** `--hooks=<mode>` — parsed only so it can be REFUSED by name rather than read as a path. */
  hooksMode: string | null;
  help?: boolean;
  /** A flag that turned out to have no value. A non-empty field is a REFUSAL, not a default. */
  missingValue?: string;
}

/** A finding about the PRESENCE of a file — what an ESLint rule cannot express. */
export interface StructureFinding {
  file: string;
  message: string;
}

/** One line of a build plan: a step, whether it applies to this paper, and why. */
export interface PlanLine {
  step: string;
  applies: boolean;
  /** A required step that does not apply refuses the build instead of being skipped. */
  required: boolean;
  why: string;
}

/**
 * The build outcome for one paper. `no-source` — there is no `paper.tex` to compile — is a
 * REFUSAL, not a skip: "nothing to build" and "built" must never look alike.
 */
export interface BuildResult {
  dir: string;
  status: "built" | "failed" | "no-source";
  plan: PlanLine[];
  /** `--dry-run`: the plan was printed and nothing ran. */
  dry?: boolean;
  /** The step that failed and what to show for it. */
  failure?: { step: string; lines: string[] };
  /** What the steps reported on success: pass counts, undefined-reference warnings. */
  notes?: string[];
  /** A paper.pdf from an earlier run was on disk and `buildPapers` removed it before building. */
  staleRemoved?: boolean;
}

/** The result of reading the config: either data, or the exit code the caller exits with. */
export type ConfigRead =
  | { opts: RppConfig; configPath: string | null; code?: undefined }
  | { code: number; opts?: undefined; configPath?: undefined };
