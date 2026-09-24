// Types for lib/paper-config.mjs, which `src/*.ts` imports. Without this file TypeScript sees
// `any` and each import needs a `@ts-expect-error`, which covers only the next line and stops
// working as soon as a formatter wraps the import across several lines.
//
// The field names are typed as `string`, not as their values, so that the value is written
// once, in paper-config.mjs.

export declare const CONFIG_KEY: string;
export declare const DEFAULT_PAPERS_ROOT: string;
export declare const PAPERS_DIR_FIELD: string;
export declare const OLD_PAPERS_DIR_FIELD: string;

/** The error text for settings that still use the old field name, or `null` when they do not. */
export declare function renamedFieldMessage(
  settings: unknown,
  where?: string,
): string | null;
