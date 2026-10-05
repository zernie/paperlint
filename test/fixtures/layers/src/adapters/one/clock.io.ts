// expect: clean
/** The clock is an effect, read where effects are: an adapter's *.io.ts. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);
