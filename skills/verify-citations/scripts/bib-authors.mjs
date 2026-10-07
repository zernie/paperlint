#!/usr/bin/env node
/**
 * bib-authors.mjs — does our author list match the VERSION we claim to cite?
 *
 * The gap this fills, stated precisely so it does not drift into its neighbour:
 *   verify-cites.mjs  asks "does this citation exist, and does the DOI point at it?"
 *   this script       asks "we say @inproceedings{...NeurIPS 2023}; is our author list
 *                     the NeurIPS one, or did we copy the arXiv preprint's?"
 *
 * 🔴 Why this is its own check (measured 2026-08-24, on a paper a `verify-citations`
 * pass had already reported as "ALL 23 cites verified real"):
 *
 *   schick2023toolformer   — ours 8 authors. NeurIPS 2023 has NINE. Eric Hambro, a real
 *                            person, was simply absent from a citation in an archival
 *                            publication. The arXiv preprint has 8 — that is where ours
 *                            came from.
 *   dehghani2022efficiency — ours: Dehghani, Arnab, Beyer, Vaswani, Tay.
 *                            ICLR 2022:  Dehghani, TAY, Arnab, Beyer, Vaswani.
 *                            Again the preprint's list, under a proceedings entry.
 *
 * Both are invisible to an existence check: the paper is real, the id resolves, the title
 * matches. The defect lives only in the gap between the venue we NAME and the metadata we
 * CARRY, and nothing in the pipeline was looking there.
 *
 * DBLP is the source because it indexes both records separately and says so —
 * "NeurIPS 2023" and "CoRR 2023" come back as two hits with different author lists. That
 * side-by-side is the cleanest evidence available for this question.
 *
 * ⚠️ Discovery credit and a deliberate NON-dependency: this class was found by running
 * `rebiber` (yuchenlin/rebiber), which rewrites bib entries to their DBLP records. We do
 * NOT depend on it here. Re-measured 2026-09-27 on 1.4.0 (GitHub b917e36): it installs cleanly
 * now but carries 409 MB of venue data, its bundled data still misses entries live DBLP finds,
 * and what it does is REWRITE an entry — we need the comparison of an author list against the
 * published record, and that is one HTTPS call with no dependencies.
 *
 * 🔴 The normalisation below is load-bearing, not tidiness. A first cut of this comparison
 * reported 13 mismatches on our bibliography, of which ELEVEN were "Last, First" vs
 * "First Last" — pure formatting. A checker that cries 13 when 2 are real is read once and
 * then ignored; that exact death is already recorded in this repo (a skill-pointer check
 * that reported 33 findings of which 22 were live files). So: compare SURNAME SEQUENCES,
 * and report nothing else.
 *
 * Usage:  node bib-authors.mjs <paper-dir-or-.bib-or-.tex> [--json]
 * Exit:   0 = no author-set/order differences   1 = differences found   2 = usage/IO error
 */
import { resolve } from "node:path";
import { gitCommitted } from "#src/adapters/git/index";
import { latexReader } from "#src/adapters/latex/index";
import { nodeFiles, spawnProcess } from "#src/adapters/node/index";
import { absolutePath } from "#src/domain/paths";
import { bibReader } from "#src/adapters/bibtex/index";
import { bibliographyAt, bibliographyUnreadWhy } from "#src/paper-sources";
import { isMain } from "../../paper-pipeline/scripts/consumer.mjs";

const DBLP = "https://dblp.org/search/publ/api";

/* ---------- input: the bibliography TeX reads, or a .bib named ---------- */

const DEPS = {
  files: nodeFiles,
  latex: latexReader,
  committed: gitCommitted(spawnProcess(), process.env),
  bib: bibReader,
};

/**
 * The texts to read: a `.bib` as named; for a paper directory or a `.tex`, the databases TeX reads —
 * `bibliographyAt` (src/paper-sources.ts) answers, and refuses in its words.
 */
function bibliographyFrom(target) {
  const r = bibliographyAt(absolutePath(resolve(target)), DEPS);
  if (!r.ok) die(bibliographyUnreadWhy(r.error));
  const { texts } = r.value;
  return { files: [...new Set(texts.map((x) => x.path))], texts };
}

/* ---------- entries: as the bibtex reader read them ---------- */

/** A name of a name list as BibTeX writes it, family part first: `von Last, First`, or the literal. */
const writtenName = (n) =>
  n.name ??
  [[n.prefix, n.lastName].filter(Boolean).join(" "), n.firstName]
    .filter(Boolean)
    .join(", ");

/**
 * The entries this check reads, from the bibtex reader's (src/ports/bib-reader.ts): type, key, the
 * author list written out (`and others` kept), title, booktitle and journal; "" for a field it lacks.
 */
export function authorEntries(entries) {
  return entries.map((e) => ({
    type: e.type,
    key: e.key,
    author: (e.names.author ?? []).map(writtenName).join(" and "),
    title: e.fields.title ?? "",
    booktitle: e.fields.booktitle ?? "",
    journal: e.fields.journal ?? "",
  }));
}

/* ---------- normalisation: surnames only, in order ---------- */

const DEACCENT = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[{}\\'`"^~]/g, "");

export function surnames(authorField) {
  if (!authorField) return [];
  return DEACCENT(authorField)
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Reduce BOTH orders to the final token of the family name.
      //   "Berg, Jan van der"  -> family part "Berg"        -> "berg"
      //   "van der Berg, Jan"  -> family part "van der Berg"-> "berg"
      //   "Jan van der Berg"   -> last token               -> "berg"
      // 🔴 Taking the whole family part in the comma branch (the first version of this) made
      // the two orders normalise DIFFERENTLY for any particle surname — "van der berg" vs
      // "berg" — so every Dutch/German co-author would have read as a real disagreement
      // against DBLP, which always writes "First Last". The colocated test caught it before
      // this shipped; the assertion pinning it is "a multi-token surname keeps its last token,
      // consistently in both orders".
      const familyPart = p.includes(",") ? p.split(",")[0] : p;
      const last = familyPart.trim().split(/\s+/).slice(-1)[0] || "";
      return last
        .trim()
        .toLowerCase()
        .replace(/[.\s-]+$/, "");
    })
    .filter((s) => s && s !== "others");
}

// Only called for an entry that has an author (checkAuthors filters on it first).
export const truncated = (authorField) => /\band\s+others\b/i.test(authorField);

/** Is the entry claiming a PUBLISHED venue (as opposed to a preprint)? */
export function claimsPublished(e) {
  const venue = `${e.booktitle} ${e.journal}`.trim();
  if (!venue) return false;
  return !/^\s*arxiv\b|arxiv preprint|\bcorr\b/i.test(venue);
}

/* ---------- DBLP ---------- */

export async function dblpHits(title) {
  const url = `${DBLP}/?q=${encodeURIComponent(title)}&format=json&h=6`;
  // Per-request timeout: a check that hangs is indistinguishable from a check that is dead,
  // and this one runs 25+ requests. Measured 2026-08-24: a single unbounded query stalled the
  // whole run past two minutes while a healthy one answers in ~0.6 s.
  const res = await fetch(url, {
    headers: { "User-Agent": "bib-authors/1.0 (paper QA)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429)
    throw Object.assign(new Error("DBLP 429"), { retryable: true });
  if (!res.ok) throw new Error(`DBLP ${res.status}`);
  const hits = (await res.json())?.result?.hits?.hit ?? [];
  return hits.map((h) => {
    const a = h.info?.authors?.author;
    const list = a ? (Array.isArray(a) ? a : [a]) : [];
    return {
      venue: h.info?.venue ?? "",
      year: h.info?.year ?? "",
      type: h.info?.type ?? "",
      title: h.info?.title ?? "",
      // DBLP disambiguates people as "Mostafa Dehghani 0001" — the digits are not a name.
      authors: list.map((p) => String(p.text).replace(/\s+\d{4}$/, "")),
    };
  });
}

const isPreprintRecord = (h) =>
  /^corr$/i.test(h.venue) || /informal/i.test(h.type);
const looseTitle = (s) =>
  DEACCENT(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/* ---------- the comparison ---------- */

export function compare(ourSurnames, theirSurnames) {
  const missing = theirSurnames.filter((x) => !ourSurnames.includes(x));
  const extra = ourSurnames.filter((x) => !theirSurnames.includes(x));
  const orderDiffers =
    missing.length === 0 &&
    extra.length === 0 &&
    ourSurnames.join("|") !== theirSurnames.join("|");
  return { missing, extra, orderDiffers };
}

/**
 * The comparison over parsed entries, the network behind `lookup` (DBLP by default). Returns the
 * buckets main() prints and `paperlint build` records: `findings` (the author list differs from
 * the published version's), `matched` (compared, equal), `skipped` (not applicable), `unchecked`
 * (the lookup FAILED — never a pass). An entry in none of them was a preprint entry, which may
 * carry preprint metadata.
 *
 * @param lookup  title → DBLP-shaped hits; throws on a failed request (`retryable` for a 429)
 * @param pause   ms → a promise; DBLP asks for gentle clients. A test passes `() => {}`.
 */
export async function checkAuthors(
  parsed,
  {
    lookup = dblpHits,
    pause = (ms) =>
      new Promise((r) => {
        setTimeout(r, ms);
      }),
  } = {},
) {
  const findings = [];
  const skipped = []; // legitimately not applicable
  const unchecked = []; // we FAILED to check — must never be reported as a pass
  const matched = []; // compared against the published record, and equal
  const entries = parsed.filter((e) => e.title && e.author);

  for (const e of entries) {
    if (!claimsPublished(e)) continue; // a preprint entry is allowed to carry preprint metadata
    if (truncated(e.author)) {
      skipped.push({
        key: e.key,
        why: "author list ends in `and others` — completeness not checkable",
      });
      continue;
    }
    // 🔴 A failed lookup is NOT a skip. Measured 2026-08-24: the first run reported
    // "PASS: no author-list disagreement" while NINE of 27 entries had never been examined —
    // five of them because DBLP answered 429. A verdict printed over unexamined data is the
    // "counter that counts what it ignores" failure this repo already has written down.
    // So: retry transient failures, then record them in a SEPARATE bucket that suppresses PASS.
    let hits = null;
    for (let attempt = 0; attempt < 3 && hits === null; attempt++) {
      try {
        hits = await lookup(e.title.replace(/[{}]/g, ""));
      } catch (err) {
        const last = attempt === 2;
        if (last)
          unchecked.push({
            key: e.key,
            why: `DBLP lookup failed: ${err.message}`,
          });
        else await pause(1500 * (attempt + 1));
      }
    }
    if (hits === null) continue;
    const want = looseTitle(e.title);
    const same = hits.filter((h) => looseTitle(h.title) === want);
    // We claim the published version, so compare against the published record, never CoRR.
    const rec = same.find((h) => !isPreprintRecord(h));
    if (!rec) {
      skipped.push({
        key: e.key,
        why: same.length
          ? "only a preprint record on DBLP"
          : "no DBLP title match",
      });
      continue;
    }
    const ours = surnames(e.author);
    const theirs = surnames(rec.authors.join(" and "));
    const d = compare(ours, theirs);
    if (!(d.missing.length || d.extra.length || d.orderDiffers))
      matched.push(e.key);
    else {
      findings.push({
        key: e.key,
        venue: `${rec.venue} ${rec.year}`.trim(),
        ours,
        theirs,
        ...d,
      });
    }
    await pause(900); // DBLP asks for gentle clients; 350 ms drew 429s
  }

  return { findings, skipped, unchecked, matched };
}

function die(msg) {
  console.error(`bib-authors: ${msg}`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const asJson = process.argv.includes("--json");
  if (!args[0])
    die("usage: bib-authors.mjs <paper-dir|file.bib|file.tex> [--json]");

  const { files, texts } = bibliographyFrom(args[0]);
  const file = files.join(", ");
  const parsed = texts.flatMap((t) => authorEntries(t.entries));
  const entries = parsed.filter((e) => e.title && e.author);
  const { findings, skipped, unchecked } = await checkAuthors(parsed);
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          file: files[0],
          files,
          entries: entries.length,
          findings,
          skipped,
          unchecked,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`== bib-authors: ${file} ==`);
    for (const f of findings) {
      console.log(`\n  🔴 ${f.key}  (DBLP: ${f.venue})`);
      if (f.missing.length)
        console.log(`     MISSING from ours : ${f.missing.join(", ")}`);
      if (f.extra.length)
        console.log(`     EXTRA in ours     : ${f.extra.join(", ")}`);
      if (f.orderDiffers) {
        console.log(`     ORDER differs`);
        console.log(`       ours : ${f.ours.join(" > ")}`);
        console.log(`       DBLP : ${f.theirs.join(" > ")}`);
      }
    }
    for (const s of skipped) console.log(`  · n/a ${s.key} — ${s.why}`);
    for (const u of unchecked)
      console.log(`  ⚠️ NOT CHECKED ${u.key} — ${u.why}`);
    console.log(
      `\n-- ${entries.length} entries · ${findings.length} difference(s) · ` +
        `${skipped.length} not applicable · ${unchecked.length} NOT CHECKED`,
    );
    console.log(
      findings.length
        ? "FAIL: our author list disagrees with the version we claim to cite."
        : unchecked.length
          ? `PARTIAL: no disagreement among the entries reached, but ${unchecked.length} could not be checked — this is NOT a pass.`
          : "PASS: no author-list disagreement.",
    );
  }
  // 🔴 THE UNCHECKED IS NOT A PASS EITHER (review #189). The exit code depended only
  // on findings, so a run where DBLP did not answer EVEN ONCE (a timeout, a series of
  // 429s) exited 0 — and the caller read an author audit THAT NEVER RAN as passed.
  // The text next to it already said "this is NOT a pass", but a human reads the text
  // while CI reads the exit code. A divergence between what the script SAYS and what it
  // REPORTS to its caller is the same class as "the gate checked the wrong file".
  // Different codes so the caller can tell them apart: 1 — there are disagreements,
  // 2 — the audit is incomplete.
  process.exit(findings.length ? 1 : unchecked.length ? 2 : 0);
}

// 🔴 `isMain`, NOT `import.meta.url === `file://${process.argv[1]}``. Node resolves the entry point
// to its REAL path for `import.meta.url` but leaves `process.argv[1]` as typed, so through a symlink
// the two are not equal and the CLI silently does not execute — the process exits 0 having done
// nothing. The consumer reaches these scripts precisely through a symlink. Observed 14.09 on run
// 34784079821: `extract-pdf-facts.mjs --strict` returned RC=0 and created no facts file.
if (isMain(import.meta.url)) await main();
