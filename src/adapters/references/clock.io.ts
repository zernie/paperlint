/** The clock, for the lookup cache: the day an answer was fetched, in UTC. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** Wait `ms` — DBLP's pace between requests. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });
