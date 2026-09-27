// Types for verify-cites.mjs, for the exports `src/` imports — the same arrangement as
// `skills/paper-pipeline/scripts/consumer.d.mts`. Without this file TypeScript sees an untyped
// module, and every import needed a `@ts-expect-error` plus a cast at each call.
//
// Only what `src/` imports is declared. The `.mjs` is not typechecked, so a declaration nobody
// compiles against would drift without anyone noticing.

/** One entry as `parseBib` returns it: the BibTeX key as `id`, plus the fields it recognised. */
export interface Citation {
  readonly id: string;
  readonly [field: string]: unknown;
}

/** Every entry of a BibTeX text, `@comment`/`@string`/`@preamble` skipped. */
export declare function parseBib(text: string): Citation[];

/** The title reduced to what identifies it: case, braces and punctuation removed. */
export declare function titleIdentity(title: string): string;

/** Answers the resolvers gave, keyed by request — shared between citations and runs. */
export type ResponseCache = Record<string, unknown>;

/** Would verifying `citation` make a request, given `cache`? Answers from the cache only. */
export declare function wouldAsk(
  citation: Citation,
  cache: ResponseCache,
): Promise<boolean>;

/** One run's memory of which service refused: a refusing service is not asked again. */
export interface Breaker {
  call<T>(
    service: string,
    attempt: () => Promise<
      { ok: true; value: T } | { ok: false; reason: string }
    >,
  ): Promise<{ ok: true; value: T } | { ok: false; reason: string }>;
}

export declare function createBreaker(): Breaker;

/** The verdict on one citation. */
export interface CiteVerdict {
  readonly id: string;
  readonly verdict: "true" | "false" | "unresolvable";
  readonly reason?: string;
  /** "<service>: <reason>" for each question a refusing service did not answer. */
  readonly refused?: readonly string[];
}

/** Verify ONE citation live, answering from `cache` first and writing new answers into it. */
export declare function verifyCitationLive(
  citation: Citation,
  options?: {
    readonly cache?: ResponseCache;
    readonly offline?: boolean;
    readonly breaker?: Breaker;
  },
): Promise<CiteVerdict>;
