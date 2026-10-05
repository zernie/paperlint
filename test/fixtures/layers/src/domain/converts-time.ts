// expect: clean
/** A given time converted, not read: the instant of Unix seconds. */
export const instantOf = (seconds: number): string =>
  new Date(seconds * 1000).toISOString();
