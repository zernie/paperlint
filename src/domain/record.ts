/** Reading fields off a value typed `unknown` — a parsed JSON file, an object a library hands back. */

/** Any non-null object that is not an array, readable by key. */
export const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `v[key]` when `v` is a record; undefined for anything else. Inherited fields count, as `.` reads them. */
export const fieldOf = (v: unknown, key: string): unknown =>
  isRecord(v) ? v[key] : undefined;

/** A number array a library types as `any[]`, read as the numbers it holds. */
export const numbersOf = (xs: readonly unknown[]): number[] => xs.map(Number);
