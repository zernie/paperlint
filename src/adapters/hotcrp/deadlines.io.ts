/**
 * HotCRP's deadlines page over Node's `fetch`: `GET <site>/deadlines`, no token — the page is
 * public, and a deadline is nobody's secret.
 */
import { messageOf } from "../../domain/text.ts";
import { err } from "../../domain/result.ts";
import type { VenueDeadlines } from "../../ports/venue-deadlines.ts";
import { parseDeadlinesPage } from "./deadlines.ts";

const READ_TIMEOUT_MS = 60_000;

/** The deadlines of the HotCRP site at `url` (no trailing slash). */
export function hotcrpDeadlines(o: { readonly url: string }): VenueDeadlines {
  return {
    async read() {
      try {
        const r = await fetch(`${o.url}/deadlines`, {
          headers: { Accept: "text/html" },
          signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        });
        return parseDeadlinesPage(r.status, await r.text());
      } catch (e) {
        return err({ kind: "unreachable", detail: messageOf(e) });
      }
    },
  };
}
