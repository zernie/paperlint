/**
 * The outcome of something that can fail, as a value: the shape paperlint already spoke in plain unions
 * (`{ ok: true, … } | { ok: false, … }`), made generic. No classes and no fluent API — a `switch`
 * on `ok` reads the same as every other union in the package.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const map = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

export const andThen = <T, U, E, F>(
  r: Result<T, E>,
  f: (t: T) => Result<U, F>,
): Result<U, E | F> => (r.ok ? f(r.value) : r);

export const match = <T, E, R>(
  r: Result<T, E>,
  on: { readonly ok: (t: T) => R; readonly err: (e: E) => R },
): R => (r.ok ? on.ok(r.value) : on.err(r.error));

/** The `default` of an exhaustive `switch`: a new variant is a compile error, not a silent fall-through. */
export function assertNever(x: never): never {
  throw new Error(`unhandled variant: ${JSON.stringify(x)}`);
}
