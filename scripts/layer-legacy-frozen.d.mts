/** Types for `layer-legacy-frozen.mjs`, for its TypeScript test. */
export interface Suppressed {
  readonly filePath: string;
  readonly suppressedMessages?: readonly {
    readonly ruleId: string | null;
    readonly line: number;
    readonly suppressions?: readonly { readonly justification?: string }[];
  }[];
}
export type Counts = Record<string, Record<string, number>>;
export declare const FROZEN_FILE: string;
export declare const LAYER_RULES: readonly string[];
export declare const NO_LEGACY_UNDER: readonly string[];
export declare const LEGACY: RegExp;
export declare function tally(results: readonly Suppressed[]): {
  counts: Counts;
  unexplained: string[];
};
export declare function judge(o: {
  counts: Counts;
  unexplained: readonly string[];
  frozen: Counts;
}): string[];
export declare function checkFrozen(root?: string): Promise<{
  problems: string[];
  frozen: Counts;
  counts: Counts;
}>;
