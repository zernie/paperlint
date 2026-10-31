// Types for the exports `hooks/paper-skills-nudge.test.ts` imports from the hook. The hook ships as
// plain .mjs (a compiled hook may import nothing but `vigiles/hook`), so without this file TypeScript
// sees `any` and `tsc -p tsconfig.test.json` fails with TS7016 — the same reason
// `paper-edit-guard.hook.d.mts` exists.

/** One line per skill from the provider's tab-separated `name<TAB>description` output. */
export declare const skillLines: (raw: string | undefined) => readonly string[];

/** The paper a path belongs to, from every spelling of the path the event carries; null when none. */
export declare const paperOf: (
  paths: readonly (string | undefined)[],
  root: string,
) => string | null;

/** The notice text for one paper and its skill lines. */
export declare const message: (
  paper: string,
  lines: readonly string[],
) => string;

declare const hook: unknown;
export default hook;
