#!/usr/bin/env node
/**
 * extract-ref-facts.mjs — parse a paper's bibliography, ask the registries and write FACTS to JSON.
 * It judges nothing.
 *
 * Usage: node extract-ref-facts.mjs <paper dir|paper.md|refs.bib> [--offline] [--refresh]
 *                                   [--cache=PATH] [--out=PATH] [--quiet]
 * Exit: 0 — facts written · 1 — nothing to write (no source, no entries).
 *
 * WHY THE SPLIT. Before 2026-08-26 measurement and judgement lived in one script
 * (`verify-refs.mjs`, 20 emit sites, 8 kinds of findings) — that is, on the fifth rung of the
 * ladder in `the consumer's papers CLAUDE.md`. The judgement moved into ESLint rules
 * (`eslint-rules/ref-facts.mjs`): a registry of rules, severity from config, `eslint-disable` with a
 * reason, `file:line:col` positions. What stayed here is the plumbing: parsing markup, parsing
 * `.bib`, the network, parsing the registries' responses.
 *
 * The precedent in this same knowledge base is `render-paper/extract-pdf-facts.mjs` +
 * `eslint-rules/pdf-facts.mjs`. The boundary is exactly the same: the script goes out into the
 * world, the rule passes the judgement.
 *
 * 🔴 WHY THE RULE CANNOT LIVE OVER THE PAPER ITSELF. Of the three papers in the knowledge base one
 * has a `paper.md` (`<paper-a>`); in `<paper-b>` and `<paper-c>` the bibliography is `refs.bib`, and
 * no ESLint language plugin parses `.bib`. The common input that can do both is the facts JSON.
 * The price is known and written down: a finding is addressed into the facts, not into a line of
 * `paper.md`; that is why every entry in the facts carries the `line` of its source, and the rule
 * prints it in the message.
 *
 * 🔴 WHAT THIS MOVE FIXED (both legs were DEAD, measured 2026-08-26):
 *
 *  1. `.bib` WAS NEVER OPENED. `resolveSource` walked `paper.md` → `draft.md` →
 *     `build/custom.bib`; `refs.bib` was not on the list, although the error text promised
 *     "or .bib". The run: `verify-refs.mjs <papers-root>/<paper-b>` →
 *     "no paper.md, draft.md or .bib … nothing to check".
 *  2. THE `.bib` PARSER DID NOT TAKE THE REAL FILES. The regex `/@\w+\{([^,]+),([\s\S]*?)\n\}/g`
 *     required a `}` on a line of its own, while both of our `refs.bib` close an entry on the line
 *     of the last field (`note={arXiv:2310.06770}}`). A run straight at the file: "parsed 0
 *     references out of …/<paper-b>/refs.bib". That is, 40 lines of `parseBib` never ran once.
 *  3. AND A THIRD, hidden behind the first two: in `.bib` an author is written "Surname, First
 *     name", while the comparison took the LAST token of the string — for `Jimenez, Carlos E.` that
 *     is `e`. Even if the regex had worked, checking authors against `.bib` would have compared
 *     initials with surnames.
 *
 * None of this is cured by being careful, but by having `.bib` parsed by a REAL PARSER
 * (`@retorquere/bibtex-parser`), which returns `lastName` as a separate field — class #3 becomes
 * inexpressible. Occupancy was checked by a run over both real files BEFORE the choice:
 * `bibtex-parse`, `@retorquere/bibtex-parser`, `citation-js` and `astrocite-bibtex` — all four give
 * the correct 27 and 51 entries against zero from our regex. retorquere was taken because it is the
 * only one that returns a STRUCTURED name; with any other the surname would have to be cut out by
 * hand, that is, we would be writing ourselves the very half that was broken.
 *
 * 🔴 THE CACHE IS EVIDENCE, NOT A SECOND DECLARATION. `<paper>/repro/refs-cache.json` keeps the RAW
 * BODIES of the registries' responses and is committed (for `<paper-a>` it has been in git since
 * 16.08). It cannot be made up — only refreshed from the registry. The facts in `_build/` are
 * derived from it and from the bibliography, which is why `_build/` is in `.gitignore` while the
 * facts carry `source_sha256`: the rule `refs/fresh` compares it with the file on disk, and stale
 * facts become a finding rather than silence. Exactly the failure that made `api:check` in vigiles
 * print "no drift" while reading a `dist/` from the previous build.
 *
 * 🔴 PARSING THE RESPONSES LIVES HERE, NOT IN THE RULE, AND THAT IS LOAD-BEARING. The cache keeps
 * raw bodies precisely so that the CrossRef-JSON and arXiv-Atom readers are exercised on real
 * responses: every fabricated title this knowledge base has ever shipped was found by reading the
 * registry's response, not by a comparison. If the cache kept parsed entries, those readers would
 * stay uncovered while looking covered.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, basename } from "node:path";
import { headings as mdHeadings, requireMarkdown } from "../../../lib/markdown.mjs";
import { isMain } from "./consumer.mjs";

// Markup is parsed with a parser (`CLAUDE.md`, 2026-08-11). We fail rather than degrade: without
// the parser the reference list would not be found at all, and the facts would come out empty —
// that is, a clean verdict about a paper that in fact has forty references.
requireMarkdown();

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CROSSREF = "https://api.crossref.org/works/";
const ARXIV = "https://export.arxiv.org/api/query?id_list=";
// CrossRef asks for a contact in the User-Agent and gives the polite pool in return. No account
// and no key — it is a courtesy, the anonymous pool is rate-limited.
const UA = "extract-ref-facts/1.0 (https://github.com/; paper-pipeline citation facts)";

export const SCHEMA = 1;

// ── parsing: the reference list in markdown ──────────────────────────────────
//
// The same shape that `repro/md2submission.py` reads, deliberately: that script turns the list into
// the .bib actually uploaded to the venue, so whatever it counts as an entry is an entry.
// `^\d{1,2}. ` opens an entry, an indent continues it, a blank line closes it.

const REF_OPEN = /^(\d{1,2})\.\s+(.*)$/;
/** Working notes that never reach the PDF; md2submission strips them, so we do too. */
const BRACKET_NOTE = /\[(VERIFY|ANONYMIZ)[^\]]*\]/g;

export function parseMarkdownRefs(text) {
  // The section is cut by the parser. The former `text.split(/^## References\s*$/m)[1]` opened the
  // reference list on a `## References` quoted inside a ```-block — and in this repo papers quote
  // their own markup in chunks.
  const refsHs = mdHeadings(text).filter((h) => h.depth === 2 && /^References\s*$/u.test(h.text));
  if (refsHs.length === 0) return [];
  const nl = text.indexOf("\n", refsHs[0].offset);
  const body = text.slice(nl === -1 ? text.length : nl, refsHs[1] ? refsHs[1].offset : text.length);
  // The line where the body starts in the source file — so that an entry has an ADDRESS in
  // `paper.md` and not just a number in a list. The rule prints it in the message: the facts file
  // lives in `_build/`, and without the source line a finding would have to be hunted for by eye.
  const bodyLine = text.slice(0, nl === -1 ? text.length : nl).split("\n").length;
  // A heading closes the list — appendices come AFTER the bibliography, and without this their
  // numbered prose would be parsed as references. The line numbers come from the parser:
  // `/^#{1,6}\s/` also counted a hash inside a ```-block as a heading.
  const headingLines = new Set(mdHeadings(body).map((h) => h.line));
  const entries = [];
  let cur = null;
  let buf = [];
  let curLine = 0;
  const flush = () => {
    if (cur !== null)
      entries.push({ n: cur, line: curLine, raw: buf.join(" ").replace(BRACKET_NOTE, "").trim() });
    cur = null;
    buf = [];
  };
  const lns = body.split("\n");
  for (let i = 0; i < lns.length; i++) {
    const ln = lns[i];
    if (headingLines.has(i)) break;
    const m = REF_OPEN.exec(ln);
    if (m) {
      flush();
      cur = Number(m[1]);
      curLine = bodyLine + i;
      buf = [m[2].trim()];
    } else if (cur !== null && ln.trim()) buf.push(ln.trim());
    else if (cur !== null) flush();
  }
  flush();
  return entries.map(splitEntry).filter(Boolean);
}

/** `A, B, C. *Title.* rest` → authors / title / remainder — the shape md2submission produces. */
function splitEntry(e) {
  const base = { n: e.n, line: e.line, key: null, raw: e.raw };
  const mt = /\*(.+?)\*/.exec(e.raw);
  if (!mt) return { ...base, authors: [], truncated: false, title: null, year: yearIn(e.raw), venue_text: e.raw };
  const title = mt[1].trim().replace(/\.$/, "");
  const rawAuthors = splitAuthors(e.raw.slice(0, mt.index));
  const note = e.raw.slice(mt.index + mt[0].length).trim().replace(/^,\s*/, "");
  const { authors, truncated } = dropEtAl(rawAuthors);
  return { ...base, authors, truncated, title, year: yearIn(note) ?? yearIn(e.raw), venue_text: note };
}

function splitAuthors(a) {
  const s = a.trim().replace(/\.\s*$/, "").trim();
  if (!s) return [];
  return s.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * `Z. Xiang et al.` — the entry deliberately gives a PREFIX of the author list. That is a fact about
 * the entry, not a judgement, so the truncation is removed here and the rule receives an honest
 * prefix plus a flag.
 */
const ET_AL = /\bet\s+al\.?$/i;
function dropEtAl(authors) {
  if (!authors.length || !ET_AL.test(authors[authors.length - 1].trim()))
    return { authors, truncated: false };
  const out = authors.slice();
  out[out.length - 1] = out[out.length - 1].replace(ET_AL, "").trim();
  return { authors: out.filter(Boolean), truncated: true };
}

const yearIn = (s) => (/\b(19|20)\d{2}\b/.exec(s ?? "") ?? [null])[0];

// ── parsing: .bib WITH A REAL PARSER ─────────────────────────────────────────

/**
 * The name order is normalised to "First name Surname" — the same shape in which authors are written
 * in markdown. Then the rule has ONE `surname()` function (the last alphabetic token) for both
 * sources instead of two branches. Normalising the format is the parser's job; comparing is the
 * rule's job.
 *
 * 🔴 TWO SHAPES, AND BOTH ARE LISTED EXPLICITLY. The parser returns an institution
 * (`author={{Adversa AI}}` — the double brace means "one name as a whole, do not split") as
 * `{name}`, WITHOUT `lastName`: an organisation has no surname, and that is correct. The first
 * revision of this function did not know the `name` shape, so all four fields were undefined, the
 * string came out empty, and the caller dropped it with its own `.filter(Boolean)` — the author
 * disappeared silently.
 *
 * Measured 2026-09-17 on the real aisec-2026: ELEVEN entries out of fifty-one arrived with
 * `authors = []`, that is, the check over them found nothing and looked like it had passed. Exactly
 * the failure toward silence against which a real parser was taken instead of a regex.
 *
 * ⚠️ An enumeration, not "the first non-empty field": with a list the next shape reads as a missing
 * line, whereas with a `??` chain over arbitrary fields it would dissolve again.
 */
const joinName = (a) =>
  a.name ?? [a.firstName, a.prefix, a.lastName, a.suffix].filter(Boolean).join(" ").trim();

/**
 * 🔴 THE .bib PARSER IS AN OPTIONAL DEPENDENCY, AND THE FAILURE MUST BE LOUD AND CARRY THE CURE.
 * It weighs 15 MB out of the consumer's 56 MB install (the package itself 9 MB plus the English
 * model `wink-eng-lite-web-model` 4 MB and `unicode2latex` 2 MB) — 27% of the weight for a single
 * call that only whoever extracts bibliography facts needs. The import here is dynamic anyway, so
 * the laziness was already there; the manifest merely stopped lying about it being required.
 *
 * ⚠️ A silent skip here would be the worst of the options: a missing checker and a passing one look
 * the same, and "the bibliography was not checked" reads as "the bibliography is fine". That is why
 * the message names the command, not the fact.
 */
export async function parseBib(text) {
  let parse;
  try {
    ({ parse } = await import("@retorquere/bibtex-parser"));
  } catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    throw new Error(
      "parsing .bib requires @retorquere/bibtex-parser — it is declared OPTIONAL because it " +
        "weighs 15 MB and is needed only for bibliography facts.\n" +
        "   Install:  npm i -D @retorquere/bibtex-parser\n" +
        "   Why not our own regex: measured 26.08 — the regex gave 0 entries on both real " +
        "files, four libraries gave the correct 27 and 51.",
    );
  }
  // `sentenceCase: false` — the title is needed as written. Our normalisation folds the case
  // anyway, but a fact has to be a fact: a paraphrased title cannot be shown to a human.
  const res = parse(text, { sentenceCase: false, verbatimFields: [] });
  // The entry's line in the file — found by its key. The parser gives no positions, and a finding
  // needs an address; a key in `.bib` is unique by definition of the format, so the search is
  // unambiguous.
  const lines = text.split("\n");
  const lineOfKey = (key) => {
    const i = lines.findIndex((l) => l.includes(`{${key},`));
    return i === -1 ? 0 : i + 1;
  };
  return res.entries.map((e, i) => {
    const f = e.fields ?? {};
    const names = Array.isArray(f.author) ? f.author : [];
    // `and others` is BibTeX's `et al.`. The parser returns it as an author with no first name.
    const isOthers = (a) => !a.firstName && /^others$/i.test(a.lastName ?? "");
    const truncated = names.some(isOthers);
    const authors = names.filter((a) => !isOthers(a)).map(joinName).filter(Boolean);
    const str = (v) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : v == null ? "" : String(v));
    const venueText = [f.booktitle, f.journal, f.note, f.howpublished].map(str).filter(Boolean).join(" ");
    return {
      n: i + 1,
      line: lineOfKey(e.key),
      key: e.key,
      // `raw` is where identifiers are looked for: they hide in `note`, in `journal`
      // (`arXiv preprint arXiv:2107.03374`), and in a separate `doi` field.
      raw: [str(f.author && authors.join(" and ")), str(f.title), venueText, str(f.doi), str(f.url), str(f.year)]
        .filter(Boolean)
        .join(" "),
      authors,
      truncated,
      title: str(f.title).trim() || null,
      year: str(f.year).trim() || null,
      venue_text: [venueText, str(f.doi)].filter(Boolean).join(" "),
      // In BibTeX a DOI is declared as a field rather than hidden in prose — take it directly.
      doi_field: str(f.doi).trim() || null,
    };
  });
}

// ── identifiers ──────────────────────────────────────────────────────────────

const ARXIV_RE = /arxiv[:\s]\s*(\d{4}\.\d{4,5})(v\d+)?/i;
const DOI_RE = /(?:doi[:\s]\s*|doi\.org\/)(10\.\d{4,9}\/[^\s,;)}]+)/i;
const ARXIV_RE_G = new RegExp(ARXIV_RE.source, "gi");
const DOI_RE_G = new RegExp(DOI_RE.source, "gi");

/**
 * ALL identifiers of an entry, not the first one.
 *
 * 🔴 Entry [16] of the paper this was written against is one numbered entry carrying TWO works
 * (TOGA and its later re-analysis), each with its own arXiv id. A parser that stops at the first
 * checks half the entry and stays silent about the second — exactly the silence all of this exists
 * to remove. There is nothing to compare the extras against (the entry has one title and one author
 * list, and they are about the first work), so they are RESOLVED while the rule says it did not
 * compare them.
 */
export function extractIds(entry) {
  const hay = `${entry.venue_text ?? ""} ${entry.raw ?? ""}`;
  const uniq = (xs) => [...new Set(xs)];
  const doi = uniq([
    ...(entry.doi_field ? [entry.doi_field] : []),
    // A trailing period belongs to the sentence, not to the DOI. Suffixes legitimately contain
    // periods (10.18653/v1/2020.acl-main.168), so only the LAST one is stripped.
    ...[...hay.matchAll(DOI_RE_G)].map((m) => m[1].replace(/[.,]$/, "")),
  ]);
  return { arxiv: uniq([...hay.matchAll(ARXIV_RE_G)].map((m) => m[1])), doi };
}

/**
 * 🔴 `10.48550/arXiv.NNNN.NNNNN` IS A DOI REGISTERED WITH DATACITE, NOT WITH CROSSREF.
 * Measured 2026-08-26: `api.crossref.org/works/10.48550%2FarXiv.2107.03374` → **HTTP 404**,
 * "Resource not found", while the DOI is perfectly real and sits in `<paper-b>/refs.bib`.
 * Asking CrossRef about it would have produced `unresolvable-id` on a CORRECT entry — that is, an
 * `error`-level rule failing on valid input, which gets switched off the same day.
 * Such a DOI resolves at arXiv by its own number.
 */
export const ARXIV_DOI = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5})(v\d+)?$/i;

/** The record the title/authors/year are judged against: the DOI, if there is one. */
export const primaryOf = (ids) =>
  ids.doi.length ? `doi:${ids.doi[0]}` : ids.arxiv.length ? `arxiv:${ids.arxiv[0]}` : null;
export const allKeys = (ids) => [...ids.doi.map((d) => `doi:${d}`), ...ids.arxiv.map((a) => `arxiv:${a}`)];

/** Where to go for a key and with which id. Decided BEFORE the network — parsing depends on it. */
export function routeOf(key) {
  const kind = key.slice(0, key.indexOf(":"));
  const id = key.slice(key.indexOf(":") + 1);
  if (kind === "arxiv") return { registry: "arxiv", url: ARXIV + encodeURIComponent(id) };
  const m = ARXIV_DOI.exec(id);
  if (m) return { registry: "arxiv", url: ARXIV + encodeURIComponent(m[1]) };
  return { registry: "crossref", url: CROSSREF + encodeURIComponent(id) };
}

// ── registry readers ─────────────────────────────────────────────────────────

export function readCrossref(body) {
  const j = JSON.parse(body);
  const m = j.message;
  if (!m) return null;
  const dp =
    m.issued?.["date-parts"]?.[0]?.[0] ??
    m["published-print"]?.["date-parts"]?.[0]?.[0] ??
    m["published-online"]?.["date-parts"]?.[0]?.[0] ??
    null;
  // 🔴 CrossRef puts the subtitle after the colon into a SEPARATE field: for TOSEM's
  // "Variability-Aware Static Analysis at Scale: An Empirical Study" it returns
  // title=["Variability-Aware Static Analysis at Scale"], subtitle=["An Empirical Study"].
  // Comparing against `title[0]` alone gave a correct entry 0.69 and declared the title made up.
  // A checker that fires on correct entries gets muted — and then it is not a checker.
  const parts = [
    ...(Array.isArray(m.title) ? m.title : [m.title]),
    ...(Array.isArray(m.subtitle) ? m.subtitle : m.subtitle ? [m.subtitle] : []),
  ];
  return {
    title: parts.filter(Boolean).join(": "),
    authors: (m.author ?? []).map((a) => a.family ?? a.name ?? ""),
    year: dp ? String(dp) : null,
    venue: Array.isArray(m["container-title"]) ? m["container-title"][0] : m["container-title"],
    journalRef: null,
    doi: null,
    error: false,
  };
}

/** arXiv answers in Atom. One `<entry>` per id; zero entries means the id does not resolve. */
export function readArxiv(body) {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(body);
  if (!entry) return null;
  const e = entry[1];
  const tag = (name) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(e);
    return m ? unescapeXml(m[1]).replace(/\s+/g, " ").trim() : null;
  };
  const authors = [...e.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) =>
    unescapeXml(m[1]).replace(/\s+/g, " ").trim(),
  );
  const published = tag("published");
  return {
    title: tag("title"),
    authors,
    year: published ? published.slice(0, 4) : null,
    venue: null,
    // arXiv's own "this came out somewhere" fields. Either of them means a published version
    // exists.
    journalRef: tag("arxiv:journal_ref"),
    doi: tag("arxiv:doi"),
    // A search for a withdrawn or invented id still returns an <entry> whose id echoes the query;
    // a real entry's title is never "Error".
    error: /^Error$/i.test(tag("title") ?? ""),
  };
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// ── cache and network ────────────────────────────────────────────────────────

export function loadCache(path) {
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(path, cache) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 1)}\n`);
}

async function fetchKey(key) {
  const { url } = routeOf(key);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  return { httpStatus: r.status, body: await r.text(), fetched: new Date().toISOString().slice(0, 10) };
}

/**
 * A raw response → a facts record. Everything that can throw lives HERE: a rule that throws brings
 * down the whole ESLint run, not one finding.
 */
export function recordFrom(key, cached) {
  if (!cached) return { cached: false };
  const { registry } = routeOf(key);
  const base = { cached: true, registry, httpStatus: cached.httpStatus ?? null, fetched: cached.fetched ?? null };
  if (cached.httpStatus !== 200) return base;
  let rec; // no initializer: try assigns it, catch returns (2026-08-28)
  try {
    rec = registry === "crossref" ? readCrossref(cached.body) : readArxiv(cached.body);
  } catch (e) {
    return { ...base, found: false, parse_error: String(e.message).split("\n")[0] };
  }
  if (!rec) return { ...base, found: false };
  return { ...base, found: !rec.error, ...rec };
}

// ── assembling the facts ─────────────────────────────────────────────────────

/** `paper.md` → `draft.md` → `refs.bib` → `build/custom.bib`. `refs.bib` ADDED 26.08 (defect #1). */
export const SOURCE_ORDER = ["paper.md", "draft.md", "refs.bib", "build/custom.bib"];

export function resolveSource(target) {
  const t = resolve(target);
  if (existsSync(t) && statSync(t).isFile()) return t;
  for (const c of SOURCE_ORDER) {
    const p = join(t, c);
    if (existsSync(p)) return p;
  }
  return null;
}

export async function loadEntries(path) {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".bib") ? parseBib(text) : parseMarkdownRefs(text);
}

/** Every registry key a list of entries needs. Computed once so the requests go in one batch. */
export function keysFor(entries) {
  const keys = new Set();
  for (const e of entries) for (const k of allKeys(extractIds(e))) keys.add(k);
  return [...keys];
}

const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

export function buildFacts({ source, text, entries, cache, cachePath }) {
  const withIds = entries.map((e) => {
    const ids = extractIds(e);
    return { ...e, ids, primary: primaryOf(ids), keys: allKeys(ids) };
  });
  const records = {};
  for (const e of withIds) for (const k of e.keys) if (!(k in records)) records[k] = recordFrom(k, cache[k]);
  return {
    schema: SCHEMA,
    source: rel(source),
    source_kind: source.endsWith(".bib") ? "bibtex" : "markdown",
    source_sha256: createHash("sha256").update(text).digest("hex"),
    cache: cachePath ? rel(cachePath) : null,
    generated: new Date().toISOString().slice(0, 10),
    entries: withIds,
    records,
  };
}

// ── cli ──────────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? ".";
  const offline = args.includes("--offline");
  const refresh = args.includes("--refresh");
  const quiet = args.includes("--quiet");
  const opt = (name) => (args.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=").slice(1).join("=");

  const src = resolveSource(target);
  if (!src) {
    console.error(`🛑 no ${SOURCE_ORDER.join(", ")} under ${resolve(target)} — nowhere to take a bibliography from.`);
    return 1;
  }
  const paperDir = statSync(resolve(target)).isFile() ? dirname(src) : resolve(target);
  const cachePath = opt("cache") ? resolve(opt("cache")) : join(paperDir, "repro", "refs-cache.json");
  const out = opt("out") ? resolve(opt("out")) : join(paperDir, "_build", "refs.facts.json");

  const text = readFileSync(src, "utf8");
  const entries = await loadEntries(src);
  if (!entries.length) {
    // 🔴 Zero entries is a suspect, not a success. Facts with an empty list would look like a
    // clean bibliography, so we do not write them at all and exit with a non-zero code.
    console.error(`🛑 parsed 0 entries out of ${rel(src)}. Silence here would look like a clean bibliography.`);
    return 1;
  }

  const cache = loadCache(cachePath);
  let fetched = 0;
  if (!offline) {
    for (const k of keysFor(entries)) {
      if (cache[k] && !refresh) continue;
      try {
        cache[k] = await fetchKey(k);
        fetched++;
      } catch (err) {
        // A network failure is NOT a clean result: the key stays missing, and the rule will say
        // the entry was not checked instead of declaring it correct.
        if (!quiet) console.error(`   … ${k}: ${err.message}`);
      }
      // A braced body: a concise arrow returns the Timeout out of the promise executor, where
      // nobody reads it (`no-promise-executor-return`, 2026-08-28). The behaviour is the same.
      await new Promise((r) => { setTimeout(r, 250); }); // both registries ask for a polite pace
    }
    if (fetched) saveCache(cachePath, cache);
  }

  const facts = buildFacts({ source: src, text, entries, cache, cachePath });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(facts, null, 2)}\n`);
  const resolved = Object.values(facts.records).filter((r) => r.found).length;
  console.log(
    `📚 ${basename(src)} → ${rel(out)} (${entries.length} entries, ${Object.keys(facts.records).length} identifiers, ` +
      `${resolved} resolved${offline ? ", offline" : fetched ? `, +${fetched} fetched` : ", all from cache"})`,
  );
  return 0;
}

if (isMain(import.meta.url)) main(process.argv).then((c) => process.exit(c));
