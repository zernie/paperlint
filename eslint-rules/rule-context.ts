/**
 * The slice of ESLint's rule API the rules in this directory use.
 *
 * These rules run on three languages (JavaScript, markdown and the `.tex` language next door),
 * and ESLint's own `Rule.RuleContext` is the JavaScript one. So the rules are typed against what
 * they actually touch, the way `src/venue-rules.ts` and `src/reference-rules.ts` already are.
 */

/** A line and a 1-based column, as ESLint reports them. */
export interface Loc {
  readonly line: number;
  readonly column: number;
}

import type { Root } from "mdast";

/** The source code a rule reads. `raw` exists on the `.tex` language's source code only. */
export interface RuleSourceCode {
  readonly text: string;
  readonly raw?: string;
  /** mdast: the markdown language's tree, or the `.tex` language's projection of one. */
  readonly ast?: Root;
  getLocFromIndex(index: number): Loc;
  getText(node?: object): string;
}

/** What a fix produces: replace `range` of the file with `text`. */
export interface RuleFix {
  readonly range: readonly [number, number];
  readonly text: string;
}

export interface RuleFixer {
  replaceTextRange(range: readonly [number, number], text: string): RuleFix;
  insertTextBeforeRange(
    range: readonly [number, number],
    text: string,
  ): RuleFix;
}

export interface RuleSuggestion {
  readonly messageId: string;
  readonly data?: Readonly<Record<string, string | number>>;
  fix(fixer: RuleFixer): RuleFix;
}

export interface RuleReport {
  readonly node?: object;
  readonly loc?: { readonly start: Loc; readonly end: Loc };
  readonly messageId: string;
  readonly data?: Readonly<Record<string, string | number>>;
  readonly fix?: (fixer: RuleFixer) => RuleFix;
  readonly suggest?: readonly RuleSuggestion[];
}

export interface RuleContext {
  readonly filename: string;
  readonly options: readonly unknown[];
  readonly settings: Readonly<Record<string, unknown>>;
  readonly sourceCode: RuleSourceCode;
  report(descriptor: RuleReport): void;
}
