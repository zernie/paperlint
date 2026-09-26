/**
 * The online reference checks, as the `CheckReferences` port: `verify-cites` (the cited work
 * exists, the title matches — Crossref, OpenAlex, Semantic Scholar, arXiv) and `bib-authors` (the
 * authors are the published version's — DBLP). Both ship in this package's verify-citations skill;
 * this adapter only runs them and shapes their answers.
 *
 * "Not checked" is decided up front, by one request: when Crossref cannot be reached at all, the
 * checkers would degrade every entry to `unresolvable` / `unchecked`, which reads like a result.
 * Saying `not-checked` with the reason is the honest record.
 */
import type {
  CheckReferences,
  EntryVerdict,
} from "../../ports/check-references.ts";
// @ts-expect-error — a skill script in .mjs, it has no types
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";
// @ts-expect-error — a skill script in .mjs, it has no types
import * as authors from "../../../skills/verify-citations/scripts/bib-authors.mjs";

interface CiteResult {
  readonly id: string;
  readonly verdict: "true" | "false" | "unresolvable";
  readonly reason?: string;
}
interface AuthorFinding {
  readonly key: string;
  readonly venue: string;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly orderDiffers: boolean;
}
interface KeyWhy {
  readonly key: string;
  readonly why: string;
}

/** Why the services cannot be reached, or null when they can. */
async function unreachable(): Promise<string | null> {
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

const describeAuthors = (f: AuthorFinding): string =>
  [
    f.missing.length ? `missing ${f.missing.join(", ")}` : "",
    f.extra.length ? `extra ${f.extra.join(", ")}` : "",
    f.orderDiffers ? "order differs" : "",
  ]
    .filter(Boolean)
    .join("; ") + ` (DBLP: ${f.venue})`;

export const onlineReferences: CheckReferences = async (bib) => {
  const why = await unreachable();
  if (why !== null) return { kind: "not-checked", why };
  const cache = {};
  const found: CiteResult[] = [];
  for (const c of cites.parseBib(bib) as { id?: string }[])
    if (c.id) found.push(await cites.verifyCitationLive(c, { cache }));
  const a = (await authors.checkAuthors(authors.parseBib(bib))) as {
    findings: AuthorFinding[];
    skipped: KeyWhy[];
    unchecked: KeyWhy[];
    matched: string[];
  };
  const keys = new Set([
    ...found.map((c) => c.id),
    ...a.findings.map((f) => f.key),
  ]);
  const entries: EntryVerdict[] = [...keys].map((key) => {
    const c = found.find((x) => x.id === key);
    const mismatch = a.findings.find((f) => f.key === key);
    const unchecked = a.unchecked.find((u) => u.key === key);
    const why = [
      c && c.verdict !== "true" ? c.reason : undefined,
      mismatch ? describeAuthors(mismatch) : undefined,
      unchecked?.why,
    ]
      .filter(Boolean)
      .join("; ");
    return {
      key,
      exists: c?.verdict ?? "unresolvable",
      authors: mismatch
        ? "mismatch"
        : unchecked
          ? "unchecked"
          : a.matched.includes(key)
            ? "match"
            : "skipped",
      ...(why ? { why } : {}),
    };
  });
  return { kind: "checked", entries };
};
