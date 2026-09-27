// Types for lib/check.mjs — the shared harness assertion helper (see the module).

/** A failure detail: text, any value (rendered with `util.inspect`), or a thunk producing one. */
export type Detail = unknown;

export declare function renderDetail(detail: Detail): string;
export declare function failureMessage(label: string, detail: Detail): string;

export interface Check {
  (label: string, cond: unknown, detail?: Detail): void;
  /** How many times this checker has been called. */
  readonly count: number;
}

export declare function createChecker(options?: {
  log?: (line: string) => void;
}): Check;
