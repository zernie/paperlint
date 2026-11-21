/**
 * The questions `paperlint init` asks a human, shaped by what init needs: a yes/no with a default,
 * one choice out of a list, and a line of text. Nothing here knows which library draws them
 * (`src/adapters/clack/`), so a test answers them without a pseudo-terminal.
 *
 * A cancelled question (Ctrl+C, Esc) is `cancel`, never an answer: init stops at once rather than
 * taking a default the person was trying to refuse.
 */
export type Answer<T> =
  { readonly kind: "answer"; readonly value: T } | { readonly kind: "cancel" };

export interface Prompts {
  readonly confirm: (q: {
    readonly message: string;
    readonly initial: boolean;
  }) => Promise<Answer<boolean>>;
  readonly select: (q: {
    readonly message: string;
    readonly options: readonly string[];
    readonly initial: string;
  }) => Promise<Answer<string>>;
  /** An empty line is the answer `""`. */
  readonly text: (q: {
    readonly message: string;
    readonly placeholder: string;
  }) => Promise<Answer<string>>;
}
