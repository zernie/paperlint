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
 * NOT depend on it here. Two reasons, both practical: its install needs a Python toolchain
 * that fights modern setuptools (bibtexparser wheel fails with `AttributeError:
 * install_layout`; the workaround is vendoring a tarball), and its output REPLACES entries
 * with DBLP's very long official booktitles, which is wrong for a page-limited paper. What
 * we actually needed was the comparison, and that is one HTTPS call with no dependencies.
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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import {
  headings as mdHeadings,
  requireMarkdown,
} from "../../../lib/markdown.mjs";
import { isMain } from "../../paper-pipeline/scripts/consumer.mjs";

const DBLP = "https://dblp.org/search/publ/api";

/* ---------- input: a .bib, a .tex with filecontents, or a paper dir ---------- */

/**
 * Some papers carry no BibTeX at all. `compile-rules-2026` writes its 67 references as a
 * hand-numbered markdown list that `repro/md2acl.py` turns into ACL format at build time:
 *
 *   12. N. F. Liu, K. Lin, J. Hewitt. *Lost in the Middle: How Language Models Use Long
 *       Contexts.* TACL, 2024. arXiv:2307.03172.
 *
 * 🔴 Exempting such a paper would be the wrong call, and measurably so: a hand-written author
 * list has NO machine-checkable source, so it is the MORE exposed of the two formats, not the
 * less. The class this script hunts lives exactly where an entry names a published venue and an
 * arXiv id in the same breath — which is most of this list.
 *
 * Authors are taken only from the text BEFORE the first `*`, on purpose: entries here sometimes
 * append a second work ("— and the reanalysis: S. B. Hossain, ...") after the title, and folding
 * those names in would invent co-authors that the first work does not have.
 */
export function parseMarkdownRefs(text) {
  // 🔴 The heading comes FROM THE PARSER, not from a regex (the base's rule "parse markdown with a
  // parser"). The previous `text.search(/^#+\s*References\s*$/m)` opened the bibliography on a
  // `## References` line QUOTED inside a ``` fence — and the papers in this repo quote their own
  // markup in chunks. Exactly this assert already stands at a neighbour
  // (`paper-pipeline/scripts/extract-ref-facts.harness.mjs`: "a heading inside a ``` block is not a
  // heading"), that is, the class was known and was being reproduced here again.
  // `requireMarkdown()` — so that a missing markdown-it fails LOUDLY: with an empty parser
  // `headings()` returns [], and the gate would report "no references" instead of refusing. That is
  // the same trade of one silent failure for another that the rule was written against.
  requireMarkdown();
  const h = mdHeadings(text).find((x) => /^References\s*$/u.test(x.text));
  if (!h) return [];
  const body = text.slice(h.offset);
  const out = [];
  // 🔴 `$(?![\s\S])`, NOT `\Z`. JavaScript has no `\Z` anchor — outside a unicode-mode pattern it
  // is an identity escape meaning the LETTER Z, so the first version of this lookahead ended entry
  // 1 in the middle of "J. Zhou", at the Z. Measured: 48 of 67 references parsed, and the missing
  // 19 looked like ordinary gaps rather than a bug. Same family as the `\b`-over-Cyrillic defect
  // already recorded in this repo: an escape that means one thing in Perl/Python and another here.
  const re = /^(\d+)\.[ \t]+([\s\S]*?)(?=^\d+\.[ \t]|^#|$(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(body))) {
    const entry = m[2].replace(/\s*\n\s*/g, " ").trim();
    const t = entry.match(/\*([^*]+)\*/);
    if (!t) {
      // No italic title and no author list — in this corpus these are SOFTWARE references
      // (npm packages, repos). Nothing for DBLP to disagree with. They are surfaced as
      // not-applicable rather than dropped: an entry that silently vanishes between the file
      // and the report is indistinguishable from an entry that passed.
      out.push({
        type: "mdref",
        key: `ref${m[1]}`,
        unparsed: true,
        author: "",
        title: "",
        booktitle: "",
        journal: "",
      });
      continue;
    }
    const authorPart = entry
      .slice(0, entry.indexOf("*"))
      .trim()
      .replace(/[.,;]\s*$/, "");
    const rest = entry.slice(entry.indexOf(t[0]) + t[0].length);
    out.push({
      type: "mdref",
      key: `ref${m[1]}`,
      author: authorPart
        .split(/,\s*|\s+and\s+/)
        .filter(Boolean)
        .join(" and "),
      title: t[1].replace(/\.$/, "").trim(),
      booktitle: rest.trim(),
      journal: "",
    });
  }
  return out;
}

function bibTextFrom(target) {
  let file = target;
  if (!existsSync(file)) die(`no such path: ${file}`);
  if (!extname(file)) {
    const names = readdirSync(file);
    // 🔴 THE CANONICAL NAME FIRST, then the only candidate, and never "whichever
    // turns up first" (review #189). It used to be `names.find(f => f.endsWith(".tex"))`,
    // that is, the first in directory order. Measured: one of the papers in the corpus
    // has FIVE drafts lying around (paper-CONSTRUCTIVE-…, paper-FOLDED-…, paper-SAFE-…),
    // while PIPELINE-STATUS.md names `paper.tex` as the submitted source. The author
    // check went off into a stale draft and printed a verdict about the WRONG
    // bibliography — a gate that checks the wrong file is worse than a missing one,
    // because it says "checked".
    const pick = (ext) => {
      const canon = names.find((f) => f === `paper${ext}`);
      if (canon) return canon;
      const all = names.filter((f) => f.endsWith(ext)).sort();
      if (all.length === 1) return all[0];
      if (all.length > 1) {
        // We do not fail: a new check here would set up one more surface, and its
        // home is decided by the ladder in the `CLAUDE.md` next to the papers, not by
        // this script (the `frozen-checks` ratchet is what guards that). It is enough
        // to SAY it out loud and to choose DETERMINISTICALLY — the header below prints
        // which file was checked anyway, so the reader sees the choice.
        console.error(
          `⚠️ ${file} holds several ${ext} files and no canonical paper${ext}: ` +
            `${all.join(", ")} — took ${all[0]}. If that is the wrong one, name the file explicitly.`,
        );
        return all[0];
      }
      return undefined;
    };
    const found =
      pick(".bib") ||
      pick(".tex") ||
      names.find((f) => f === "paper.md" || f === "draft.md");
    if (!found) die(`no .bib, .tex or paper.md in ${file}`);
    file = join(file, found);
  }
  const text = readFileSync(file, "utf-8");
  if (file.endsWith(".md")) return { text, file, markdown: true };
  if (file.endsWith(".bib")) return { text, file };
  // A .tex may carry the bibliography inline via filecontents — that is how our papers do it.
  const m = text.match(
    /\\begin\{filecontents\*?\}(?:\[[^\]]*\])?\{[^}]*\.bib\}\r?\n([\s\S]*?)\\end\{filecontents\*?\}/,
  );
  if (m) return { text: m[1], file };
  const sibling = join(file, "..", "refs.bib");
  if (existsSync(sibling))
    return { text: readFileSync(sibling, "utf-8"), file: sibling };
  die(
    `no bibliography found in ${file} (no filecontents block, no refs.bib beside it)`,
  );
}

/* ---------- a deliberately small bib reader ----------
 * Only three fields are needed (type, key, author, title, booktitle/journal), and a full
 * BibTeX grammar would be a second thing to maintain. Brace-depth counting is enough and
 * is exercised by the colocated test. */
export function parseBib(text) {
  const out = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const [, type, key] = m;
    let i = re.lastIndex,
      depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(re.lastIndex, i - 1);
    out.push({ type: type.toLowerCase(), key, ...fields(body) });
  }
  return out;
}

function fields(body) {
  const get = (name) => {
    const r = new RegExp(`(?:^|[,\\s])${name}\\s*=\\s*`, "i");
    const at = body.search(r);
    if (at === -1) return "";
    let i = body.indexOf("=", at) + 1;
    while (/\s/.test(body[i])) i++;
    if (body[i] === "{") {
      let depth = 1,
        j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        j++;
      }
      return body.slice(i + 1, j - 1);
    }
    if (body[i] === '"') {
      const j = body.indexOf('"', i + 1);
      return body.slice(i + 1, j);
    }
    const j = body.indexOf(",", i);
    return body.slice(i, j === -1 ? undefined : j);
  };
  return {
    author: get("author"),
    title: get("title"),
    booktitle: get("booktitle"),
    journal: get("journal"),
  };
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

const truncated = (authorField) => /\band\s+others\b/i.test(authorField || "");

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

  for (const e of parsed.filter((x) => x.unparsed)) {
    skipped.push({
      key: e.key,
      why: "no author/title — a reference to software or a dataset, DBLP does not apply",
    });
  }

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

  const { text, file, markdown } = bibTextFrom(args[0]);
  const parsed = markdown ? parseMarkdownRefs(text) : parseBib(text);
  const entries = parsed.filter((e) => e.title && e.author);
  const { findings, skipped, unchecked } = await checkAuthors(parsed);
  if (asJson) {
    console.log(
      JSON.stringify(
        { file, entries: entries.length, findings, skipped, unchecked },
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
