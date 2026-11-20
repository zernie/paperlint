/**
 * Where candidates come from, behind one port (`Get`): arXiv's search API (comment search,
 * `co:"<venue> <year>"`), Semantic Scholar's bulk venue listing, arXiv's OAI record (the licence)
 * and the e-print. URLs are built and answers parsed here; the transport (`http.ts`) and the
 * tests' fakes both plug into `Get`. Candidates come in a FIXED order, each with its 1-based rank.
 */
import { z } from "zod";
import { jsonOf } from "./archive.ts";
import type { Candidate } from "./paper.ts";
import type { Slot } from "./rules.ts";

export type Fetched =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; status: string }>;

/** One GET; the transport throttles and retries, so a caller sees only the final answer. */
export type Get = (url: string) => Promise<Fetched>;

const ARXIV_API = "https://export.arxiv.org/api/query";
const text = (b: Uint8Array): string => Buffer.from(b).toString("utf8");
export const baseId = (id: string): string => id.replace(/v\d+$/, "");

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const tag = (x: string, t: string): string => {
  const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(x);
  return m === null ? "" : decode(String(m[1])).replace(/\s+/g, " ").trim();
};

type Entry = Omit<Candidate, "rank" | "query" | "s2">;

/** The entries of an arXiv API Atom feed, in feed order. */
export const parseFeed = (xml: string): readonly Entry[] =>
  [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, raw]) => {
    const e = String(raw);
    return {
      id: tag(e, "id").replace(/^.*\/abs\//, ""),
      updated: tag(e, "updated").slice(0, 10),
      title: tag(e, "title"),
      comment: tag(e, "arxiv:comment"),
      journal_ref: tag(e, "arxiv:journal_ref"),
      category: /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(e)?.[1] ?? "",
      authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map(
        (m) => decode(String(m[1])).trim(),
      ),
    };
  });

/** A candidate, or the reason a source stopped giving them (logged as the slot's search error). */
export type Found = Candidate | Readonly<{ searchError: string }>;

/**
 * arXiv comment search: each query of the slot in turn, page by page (`max_results` a page, at
 * most `maxPages` pages), newest submission first; an id seen earlier in the slot is skipped.
 */
export async function* arxivCandidates(
  get: Get,
  slot: Slot,
  maxPages: number,
): AsyncGenerator<Found> {
  const seen = new Set<string>();
  let rank = 0;
  for (const query of slot.queries)
    for (let page = 0; page < maxPages; page++) {
      const u = new URL(ARXIV_API);
      u.searchParams.set("search_query", query);
      u.searchParams.set("sortBy", "submittedDate");
      u.searchParams.set("sortOrder", "descending");
      u.searchParams.set("start", String(page * slot.max_results));
      u.searchParams.set("max_results", String(slot.max_results));
      const r = await get(u.toString());
      if (!r.ok) {
        yield { searchError: `${query} page ${String(page)}: ${r.status}` };
        break;
      }
      const entries = parseFeed(text(r.bytes));
      for (const e of entries.filter((x) => !seen.has(x.id))) {
        seen.add(e.id);
        rank += 1;
        yield { ...e, rank, query };
      }
      if (entries.length < slot.max_results) break;
    }
}

const S2Page = z.object({
  total: z.number().optional(),
  token: z.string().nullish(),
  data: z
    .array(
      z.object({
        title: z.string().nullish(),
        venue: z.string().nullish(),
        publicationDate: z.string().nullish(),
        externalIds: z.object({ ArXiv: z.string().optional() }).nullish(),
      }),
    )
    .optional(),
});
type Listed = Readonly<{
  id: string;
  venue: string;
  publicationDate: string | null;
  title: string;
}>;

/** The Semantic Scholar bulk-search URL of one venue edition: the proceedings as S2 lists them. */
export const s2Url = (slot: Slot): string =>
  `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=*&venue=${encodeURIComponent(slot.s2Venue ?? slot.series)}&year=${String(slot.year)}&fields=title,externalIds,venue,year,publicationDate`;

async function s2Listing(
  get: Get,
  url: string,
): Promise<readonly Listed[] | string> {
  const all: Listed[] = [];
  let token: string | null | undefined = null;
  for (let page = 0; page < 20 && (page === 0 || token); page++) {
    const r = await get(
      url + (token ? `&token=${encodeURIComponent(token)}` : ""),
    );
    if (!r.ok) return `s2 ${r.status}`;
    const parsed = S2Page.safeParse(jsonOf(text(r.bytes)));
    if (!parsed.success) return "s2 answer not understood";
    token = parsed.data.token;
    for (const p of parsed.data.data ?? [])
      if (p.externalIds?.ArXiv)
        all.push({
          id: p.externalIds.ArXiv,
          venue: p.venue ?? "",
          publicationDate: p.publicationDate ?? null,
          title: p.title ?? "",
        });
  }
  return [...new Map(all.map((p) => [p.id, p])).values()].toSorted((a, b) =>
    a.id < b.id ? -1 : 1,
  );
}

/**
 * A Semantic Scholar venue listing: the entries with an arXiv id, in arXiv-id order, each with
 * arXiv's metadata (fetched 50 ids at a time). An id arXiv does not describe comes with empty
 * metadata, and the collector rejects it.
 */
export async function* s2Candidates(
  get: Get,
  slot: Slot,
): AsyncGenerator<Found> {
  const url = s2Url(slot);
  const list = await s2Listing(get, url);
  if (typeof list === "string") {
    yield { searchError: list };
    return;
  }
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const r = await get(
      `${ARXIV_API}?id_list=${chunk.map((p) => p.id).join(",")}&max_results=50`,
    );
    if (!r.ok) {
      yield {
        searchError: `arXiv metadata of listed ids from rank ${String(i + 1)}: ${r.status}`,
      };
      return;
    }
    const byId = new Map(
      parseFeed(text(r.bytes)).map((e) => [baseId(e.id), e] as const),
    );
    for (const [j, p] of chunk.entries()) {
      const e = byId.get(p.id);
      const empty = {
        id: p.id,
        updated: "",
        title: p.title,
        comment: "",
        journal_ref: "",
        category: "",
        authors: [],
      };
      yield {
        ...(e ?? empty),
        rank: i + j + 1,
        query: url,
        s2: { venue: p.venue, publicationDate: p.publicationDate },
      };
    }
  }
}

/** The `<license>` of arXiv's OAI record of a paper, or undefined for arXiv's default licence. */
export async function licenceUrl(
  get: Get,
  id: string,
): Promise<
  Readonly<
    { ok: true; url: string | undefined } | { ok: false; status: string }
  >
> {
  const r = await get(
    `https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:${baseId(id)}&metadataPrefix=arXiv`,
  );
  return r.ok
    ? { ok: true, url: /<license>([^<]*)<\/license>/.exec(text(r.bytes))?.[1] }
    : r;
}

/** The e-print of one versioned id. */
export const eprint = (get: Get, id: string): Promise<Fetched> =>
  get(`https://arxiv.org/src/${id}`);
