/** Whether the citation services answer at all — the one request that decides "not checked". */
export async function unreachable(): Promise<string | null> {
  try {
    await fetch("https://api.crossref.org/", {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    return null;
  } catch (e) {
    return `the citation services cannot be reached (${(e as Error).message})`;
  }
}
