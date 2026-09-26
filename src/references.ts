/**
 * THE REFERENCES A BUILD CHECKED — `<paper>/_build/references.json`, written by `paperlint build`
 * and read, offline, by the lint rules in `reference-rules.ts`.
 *
 * The package ships two online checks: `verify-cites` (the cited work exists and its title
 * matches) and `bib-authors` (the authors are those of the version cited, not the preprint's).
 * Until 3.0.0 lint could only ask whether someone had run them — by finding the word
 * "bib-authors" in a scorecard table, or a command the project configured. Now the build runs
 * them and records the result as data, beside the facts it already writes about the PDF:
 *
 *   { "schema": 1,
 *     "bib": { "source": "paper.tex", "sha256": "…" },       the bibliography that was checked
 *     "status": "checked" | "not-checked", "why": "…",       not-checked: nothing could be asked
 *     "entries": [ { "key", "exists", "authors", "why" } ] }
 *
 * A sibling file, not a new field of `paper.facts.json`: those facts are about ONE PDF and are
 * stale when it changes (`pdf_sha256`); these are about the bibliography and are stale when IT
 * changes (`bib.sha256`). One staleness key per file, the way `pdf/fresh` already works.
 *
 * 🔴 THE STEP NEVER FAILS THE BUILD. A build without network still builds the PDF; the reference
 * step records `not-checked` and the lint rule says so, as a warning. Recording "not checked" as
 * a pass would be the counter that counts what it never looked at.
 */
import { join } from "node:path";
import type { AbsolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { Files } from "./ports/files.ts";
import type {
  CheckReferences,
  EntryVerdict,
  ReferencesCheck,
} from "./ports/check-references.ts";
// @ts-expect-error — an ESLint rule module in .mjs, it has no types
import { bibRange } from "../eslint-rules/paper-typography.mjs";

export const REFERENCES_SCHEMA = 1;
export const REFERENCES_FILE = "references.json";

/** Where a paper's reference verdicts live — beside `paper.facts.json`. */
export const referencesPath = (paperDir: string): string =>
  join(paperDir, "_build", REFERENCES_FILE);

const at = (p: string): AbsolutePath => p as AbsolutePath;
const text = (files: Files, p: string): string | null => {
  const b = files.readBytes(at(p));
  return b === null ? null : new TextDecoder().decode(b);
};

/** The bibliography a paper carries: inside `paper.tex` (`filecontents`), else `refs.bib`. */
export interface Bibliography {
  readonly source: "paper.tex" | "refs.bib";
  readonly text: string;
  /** Where `text` starts in the source file — so a finding can point at an entry. */
  readonly offset: number;
}

export function bibliographyOf(
  files: Files,
  paperDir: string,
): Bibliography | null {
  const tex = text(files, join(paperDir, "paper.tex"));
  const inline = tex === null ? null : bibRange(tex);
  if (inline)
    return { source: "paper.tex", text: inline.body, offset: inline.bodyStart };
  const bib = text(files, join(paperDir, "refs.bib"));
  return bib === null ? null : { source: "refs.bib", text: bib, offset: 0 };
}

export const bibHash = (b: Bibliography): string =>
  sha256Hex(new TextEncoder().encode(b.text));

/** What `_build/references.json` holds. */
export interface ReferencesDocument {
  readonly schema: number;
  readonly bib: { readonly source: string; readonly sha256: string };
  readonly status: "checked" | "not-checked";
  readonly why?: string;
  readonly entries: readonly EntryVerdict[];
}

export const documentOf = (
  bib: Bibliography,
  check: ReferencesCheck,
): ReferencesDocument => ({
  schema: REFERENCES_SCHEMA,
  bib: { source: bib.source, sha256: bibHash(bib) },
  ...(check.kind === "checked"
    ? { status: "checked" as const, entries: check.entries }
    : { status: "not-checked" as const, why: check.why, entries: [] }),
});

/** The recorded verdicts, or null when there are none or they do not parse. */
export function readReferences(
  files: Files,
  paperDir: string,
): ReferencesDocument | null {
  const raw = text(files, referencesPath(paperDir));
  if (raw === null) return null;
  try {
    const d = JSON.parse(raw) as ReferencesDocument;
    return d?.schema === REFERENCES_SCHEMA && Array.isArray(d.entries)
      ? d
      : null;
  } catch {
    return null;
  }
}

/**
 * The build step's work: check the bibliography and record the verdicts. Returns the one-line
 * note the build prints. A checker that throws is recorded as `not-checked` — the step reports,
 * it never refuses.
 */
export async function recordReferences(
  files: Files,
  paperDir: string,
  check: CheckReferences,
): Promise<string> {
  const bib = bibliographyOf(files, paperDir);
  if (bib === null) return "no bibliography — nothing to check";
  let result: ReferencesCheck;
  try {
    result = await check(bib.text);
  } catch (e) {
    result = { kind: "not-checked", why: (e as Error).message };
  }
  const doc = documentOf(bib, result);
  files.writeAtomic(
    at(referencesPath(paperDir)),
    new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`),
  );
  if (doc.status === "not-checked")
    return `references NOT checked — ${doc.why ?? "no reason given"}; lint will say so`;
  const bad = doc.entries.filter(
    (e) => e.exists === "false" || e.authors === "mismatch",
  ).length;
  return `references: ${String(doc.entries.length)} checked, ${String(bad)} failing → _build/${REFERENCES_FILE}`;
}
