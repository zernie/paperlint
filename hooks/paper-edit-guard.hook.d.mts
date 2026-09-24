// Types for the exports `src/doctor.ts` imports from the hook. The hook ships as plain
// .mjs (a compiled hook may import nothing but `vigiles/hook`), so without this file TypeScript
// sees `any` and the import needed a `@ts-expect-error` — which covers exactly ONE line and
// silently stopped covering the import once a formatter wrapped it across five.

export declare const CONFIG_KEY: "research-paper-pipeline";
export declare const DEFAULT_PAPERS_ROOT: "papers";
export declare const PAPERS_DIR_FIELD: string;
export declare const OLD_PAPERS_DIR_FIELD: string;

/** The declared papers root, or the hook's rejection object; callers tell them apart by `typeof`. */
export declare const papersRoot: (rawPkg: string) => string | object;
