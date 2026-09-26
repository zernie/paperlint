// Types for lib/paper-config.mjs, which `src/*.ts` imports. Without this file TypeScript sees
// `any` and each import needs a `@ts-expect-error`, which covers only the next line and stops
// working as soon as a formatter wraps the import across several lines.
//
// The field names are typed as `string`, not as their values, so that the value is written
// once, in paper-config.mjs.

/** The tool's name — its settings file is named after it. */
export declare const CONFIG_KEY: string;
/** `paperlint.json`: the settings file, at the project root and in each paper. */
export declare const CONFIG_FILE: string;
/** The files that make a directory a paper. */
export declare const PAPER_MARKERS: readonly string[];

/** The project root, walking up from `startDir` (see the module). */
export declare function findProjectRoot(
  startDir: string,
  isFile?: (path: string) => boolean,
): string;

/** The root `paperlint.json` of `root` — undefined when absent, unparsable or not an object. */
export declare function settingsOf(
  root: string,
): Readonly<Record<string, unknown>> | undefined;
export declare const DEFAULT_PAPERS_ROOT: string;
export declare const PAPERS_DIR_FIELD: string;

/** Every key a `paperlint.json` may hold, at either level, mapped to who reads it. */
export declare const SETTINGS_KEYS: Readonly<Record<string, string>>;
/** The keys refused in a paper's `paperlint.json`. */
export declare const ROOT_ONLY_KEYS: readonly string[];
