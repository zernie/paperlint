// Types for lib/paper-config.mjs, which `src/*.ts` imports. Without this file TypeScript sees
// `any` and each import needs a `@ts-expect-error`, which covers only the next line and stops
// working as soon as a formatter wraps the import across several lines.
//
// The field names are typed as `string`, not as their values, so that the value is written
// once, in paper-config.mjs.

export declare const CONFIG_KEY: string;
export declare const LEGACY_CONFIG_KEY: string;
export declare const LEGACY_KEY_MESSAGE: string;

/** Where a parsed package.json keeps the settings: the new key, else the old one. */
export declare function declaredSettings(pkg: unknown): {
  readonly settings: unknown;
  readonly legacy: boolean;
  readonly conflict: string | null;
};

/** The settings object alone — undefined when absent or on a conflict. */
export declare function settingsOf(
  pkg: unknown,
): Readonly<Record<string, unknown>> | undefined;
export declare const DEFAULT_PAPERS_ROOT: string;
export declare const PAPERS_DIR_FIELD: string;
export declare const OLD_PAPERS_DIR_FIELD: string;

/** The error text for settings that still use the old field name, or `null` when they do not. */
export declare function renamedFieldMessage(
  settings: unknown,
  where?: string,
): string | null;

/** Every key the settings object may hold, mapped to who reads it. */
export declare const SETTINGS_KEYS: Readonly<Record<string, string>>;
