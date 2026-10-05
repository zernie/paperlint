// expect: no-restricted-syntax
/** A deadline's distance from "now", decided inside the checks: lint would change with the date. */
export const daysLeft = (deadline: number): number =>
  (deadline - Date.now()) / 86_400_000;
export const today = (): string => new Date().toISOString().slice(0, 10);
