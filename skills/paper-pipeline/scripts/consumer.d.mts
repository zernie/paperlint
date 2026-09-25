// Types for consumer.mjs, for the exports `src/*.ts` imports — the same arrangement as
// lib/paper-config.d.mts. Without this file TypeScript sees `any`, and each import needs a
// `@ts-expect-error` that covers only the next line and stops working as soon as a formatter
// wraps the import across several lines.
//
// Only what `src/` imports is declared. The `.mjs` scripts that import the rest are not
// typechecked, and a declaration nobody compiles against would drift without anyone noticing.

/** True when `metaUrl` belongs to the module Node was told to execute, symlinks included. */
export declare function isMain(metaUrl: string): boolean;

/** One link in `dir` that leads nowhere — carried on the error `installedSkills` throws. */
export interface DanglingSkillLink {
  readonly name: string;
  /** What the link points at, as written in it. */
  readonly target: string;
  /** The `stat` error code: `ENOENT` for a missing target, `ELOOP` for a cycle. */
  readonly cause: string;
}

/**
 * The skills installed in `dir`, sorted: every entry that LEADS TO a directory holding a
 * `SKILL.md`, symlinks followed. Throws an error with `code: "DANGLING_SKILL_LINK"` and a
 * `dangling: DanglingSkillLink[]` property when any entry is a link that does not resolve.
 */
export declare function installedSkills(dir: string): string[];

/** The directory of venue TeX files this package ships; `rpp build` prepends it to TEXINPUTS. */
export declare function packageVenuesDir(): string;
export declare const SHIPPED_SKILLS_DIR: string;
export declare const PACKAGE_NAME: "paperlint";
export declare const LEGACY_PACKAGE_NAME: "research-paper-pipeline";
