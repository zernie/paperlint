// Types for lib/paper-config.mjs, which `src/*.ts` imports. Without this file TypeScript sees
// `any` and each import needs a `@ts-expect-error`, which covers only the next line and stops
// working as soon as a formatter wraps the import across several lines.
//
// The field names are typed as `string`, not as their values, so that the value is written
// once, in paper-config.mjs.

export declare const CONFIG_KEY: string;

/** The settings object in a parsed package.json — undefined when absent or not an object. */
export declare function settingsOf(
  pkg: unknown,
): Readonly<Record<string, unknown>> | undefined;
export declare const DEFAULT_PAPERS_ROOT: string;
export declare const PAPERS_DIR_FIELD: string;

/** Every key the settings object may hold, mapped to who reads it. */
export declare const SETTINGS_KEYS: Readonly<Record<string, string>>;

/** The per-paper settings file, `paperlint.json`. */
export declare const PAPER_SETTINGS_FILE: string;
/** Every key `paperlint.json` may hold, mapped to who reads it. */
export declare const PAPER_SETTINGS_KEYS: Readonly<Record<string, string>>;
