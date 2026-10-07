#!/usr/bin/env node
/**
 * extract-ref-facts.mjs — parse a paper's bibliography, ask the registries and write FACTS to JSON.
 * It judges nothing.
 *
 * Usage: node extract-ref-facts.mjs <paper dir|paper.tex|refs.bib> [--offline] [--refresh]
 *                                   [--cache=PATH] [--out=PATH] [--quiet]
 * Exit: 0 — facts written · 1 — nothing to write (no source, a source that is neither a .bib nor
 * a .tex, no entries).
 *
 * WHY THE SPLIT. Before 2026-08-26 measurement and judgement lived in one script
 * (`verify-refs.mjs`, 20 emit sites, 8 kinds of findings) — that is, on the fifth rung of the
 * ladder in `the consumer's papers CLAUDE.md`. The judgement moved into ESLint rules
 * (`eslint-rules/ref-facts.mjs`): a registry of rules, severity from config, `eslint-disable` with a
 * reason, `file:line:col` positions. What stayed here is the plumbing: parsing `.bib`, the network,
 * parsing the registries' responses.
 *
 * The precedent in this same knowledge base is `render-paper/extract-pdf-facts.mjs` +
 * `eslint-rules/pdf-facts.mjs`. The boundary is exactly the same: the script goes out into the
 * world, the rule passes the judgement.
 *
 * 🔴 WHY THE RULE CANNOT LIVE OVER THE BIBLIOGRAPHY ITSELF. No ESLint language plugin parses
 * `.bib`, so the rule's input is the facts JSON. The price is known and written down: a finding is
 * addressed into the facts, not into a line of the `.bib`; that is why every entry in the facts
 * carries the `line` of its source, and the rule prints it in the message.
 *
 * 🔴 WHAT THIS MOVE FIXED (both legs were DEAD, measured 2026-08-26):
 *
 *  1. `.bib` WAS NEVER OPENED. `resolveSource` did not list `refs.bib`, although the error text
 *     promised "or .bib". The run: `verify-refs.mjs <papers-root>/<paper-b>` →
 *     "… or .bib … nothing to check".
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
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, basename } from "node:path";
import { gitCommitted } from "#src/adapters/git/index";
import { latexReader } from "#src/adapters/latex/index";
import { nodeFiles, spawnProcess } from "#src/adapters/node/index";
import { absolutePath } from "#src/domain/paths";
import { bibReader } from "#src/adapters/bibtex/index";
import { bibTexts, databasesOf, texReads } from "#src/domain/paper-sources";
import { paperSources, sourcesOf } from "#src/paper-sources";
import { isMain } from "./consumer.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CROSSREF = "https://api.crossref.org/works/";
const ARXIV = "https://export.arxiv.org/api/query?id_list=";
// CrossRef asks for a contact in the User-Agent and gives the polite pool in return. No account
// and no key — it is a courtesy, the anonymous pool is rate-limited.
const UA =
  "extract-ref-facts/1.0 (https://github.com/; paper-pipeline citation facts)";

export const SCHEMA = 1;

// ── parsing: .bib WITH A REAL PARSER ─────────────────────────────────────────

/**
 * The name order is normalised to "First name Surname". Then the rule has ONE `surname()` function
 * (the last alphabetic token). Normalising the format is the parser's job; comparing is the rule's
 * job.
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
  a.name ??
  [a.firstName, a.prefix, a.lastName, a.suffix]
    .filter(Boolean)
    .join(" ")
    .trim();

/**
 * The facts' entries of one database, as the bibtex reader read them (src/ports/bib-reader.ts): each
 * with its line in the file that holds it, so a finding points where the author edits (the block's
 * lines in paper.tex, or the `.bib`'s).
 */
export function factEntries(bib) {
  const lineOf = (at) => bib.text.slice(0, at).split("\n").length;
  return bib.entries.map((e, i) => {
    const f = e.fields;
    const names = e.names.author ?? [];
    // `and others` is BibTeX's `et al.`. The parser returns it as an author with no first name.
    const isOthers = (a) => !a.firstName && /^others$/i.test(a.lastName ?? "");
    const truncated = names.some(isOthers);
    const authors = names
      .filter((a) => !isOthers(a))
      .map(joinName)
      .filter(Boolean);
    // Every field the reader gives is text; a field the entry lacks is "".
    const str = (v) => v ?? "";
    const venueText = [f.booktitle, f.journal, f.note, f.howpublished]
      .map(str)
      .filter(Boolean)
      .join(" ");
    return {
      n: i + 1,
      line: lineOf(e.span.start),
      key: e.key,
      // `raw` is where identifiers are looked for: they hide in `note`, in `journal`
      // (`arXiv preprint arXiv:2107.03374`), and in a separate `doi` field.
      raw: [
        authors.join(" and "),
        str(f.title),
        venueText,
        str(f.doi),
        str(f.url),
        str(f.year),
      ]
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
  ids.doi.length
    ? `doi:${ids.doi[0]}`
    : ids.arxiv.length
      ? `arxiv:${ids.arxiv[0]}`
      : null;
export const allKeys = (ids) => [
  ...ids.doi.map((d) => `doi:${d}`),
  ...ids.arxiv.map((a) => `arxiv:${a}`),
];

/** Where to go for a key and with which id. Decided BEFORE the network — parsing depends on it. */
export function routeOf(key) {
  const kind = key.slice(0, key.indexOf(":"));
  const id = key.slice(key.indexOf(":") + 1);
  if (kind === "arxiv")
    return { registry: "arxiv", url: ARXIV + encodeURIComponent(id) };
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
    ...(Array.isArray(m.subtitle)
      ? m.subtitle
      : m.subtitle
        ? [m.subtitle]
        : []),
  ];
  return {
    title: parts.filter(Boolean).join(": "),
    authors: (m.author ?? []).map((a) => a.family ?? a.name ?? ""),
    year: dp ? String(dp) : null,
    venue: Array.isArray(m["container-title"])
      ? m["container-title"][0]
      : m["container-title"],
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
  const authors = [
    ...e.matchAll(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g,
    ),
  ].map((m) => unescapeXml(m[1]).replace(/\s+/g, " ").trim());
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 1)}\n`);
}

async function fetchKey(key) {
  const { url } = routeOf(key);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  return {
    httpStatus: r.status,
    body: await r.text(),
    fetched: new Date().toISOString().slice(0, 10),
  };
}

/**
 * A raw response → a facts record. Everything that can throw lives HERE: a rule that throws brings
 * down the whole ESLint run, not one finding.
 */
export function recordFrom(key, cached) {
  if (!cached) return { cached: false };
  const { registry } = routeOf(key);
  const base = {
    cached: true,
    registry,
    httpStatus: cached.httpStatus ?? null,
    fetched: cached.fetched ?? null,
  };
  if (cached.httpStatus !== 200) return base;
  let rec; // no initializer: try assigns it, catch returns (2026-08-28)
  try {
    rec =
      registry === "crossref"
        ? readCrossref(cached.body)
        : readArxiv(cached.body);
  } catch (e) {
    return {
      ...base,
      found: false,
      parse_error: String(e.message).split("\n")[0],
    };
  }
  if (!rec) return { ...base, found: false };
  return { ...base, found: !rec.error, ...rec };
}

// ── assembling the facts ─────────────────────────────────────────────────────

/**
 * WHICH BIBLIOGRAPHY: the one TeX reads, as `paperSources` decides it (src/paper-sources.ts) — never
 * an order of file names of our own. Measured on the planted papers of fixtures/paper-sources, any
 * such order reads the inline block where TeX reads a committed `refs.bib` (no `[overwrite]`), misses
 * a `\bibliography{paper}`'s `paper.bib`, or reads a COMMENTED-OUT block as zero entries.
 *
 *   a directory   its paper.tex, and the databases its `\bibliography` / `\addbibresource` declare
 *   a .tex        the same, for that file
 *   a .bib        that file, as named
 *
 */
const committed = gitCommitted(spawnProcess(), process.env);
const DEPS = {
  files: nodeFiles,
  latex: latexReader,
  committed,
  bib: bibReader,
};

/** Why a bibliography has no text to read, in words a person can act on. */
function noTextWhy(where, b) {
  switch (b.kind) {
    case "none":
      return `${where} declares no bibliography (no \\bibliography, no \\addbibresource)`;
    case "thebibliography":
      return `${where} writes its references by hand in thebibliography — there is no database to read`;
    default:
      return `${where} declares ${databasesOf(b)
        .map((d) => `${d.name} (${d.kind})`)
        .join(", ")}, and none of them is on disk`;
  }
}

/** What the reader should know about a bibliography it is about to read: conflicts, switches. */
const notes = (b) => [
  ...(b.kind === "undecided"
    ? [
        `⚠️ which bibliography TeX reads depends on a switch or a macro — reading every candidate: ${databasesOf(
          b,
        )
          .map((d) => d.name)
          .join(", ")}`,
      ]
    : []),
  ...databasesOf(b)
    .filter((d) => d.kind === "conflict")
    .map(
      (d) =>
        `⚠️ ${d.name}.bib holds other entries than the filecontents block that writes it — TeX reads the ${
          texReads(d) === d.file
            ? "file (the block has no [overwrite])"
            : "block"
        }`,
    ),
];

/**
 * The bibliography of `target`: the texts to read, or why there are none. `paperDir` is where the
 * cache and the facts go.
 */
export function bibliographyFrom(target) {
  const t = resolve(target);
  if (!existsSync(t))
    return {
      ok: false,
      why: `${t} does not exist — nowhere to take a bibliography from`,
    };
  if (statSync(t).isFile()) return fromFile(t);
  const r = paperSources(t, DEPS);
  if (!r.ok)
    return {
      ok: false,
      why: `no paper.tex in ${t} — name the paper's .tex, or a .bib to read it alone`,
    };
  return fromSources(t, rel(join(t, "paper.tex")), r.value.bibliography);
}

function fromFile(t) {
  const text = readFileSync(t, "utf8");
  if (t.endsWith(".bib"))
    return {
      ok: true,
      paperDir: dirname(t),
      texts: [bibReader.readFile(absolutePath(t), text)],
      notes: [],
    };
  if (!t.endsWith(".tex"))
    return {
      ok: false,
      why: `${rel(t)} is neither a .bib nor a .tex — give the paper's directory, its .tex, or a .bib`,
    };
  return fromSources(
    dirname(t),
    rel(t),
    sourcesOf(absolutePath(t), text, DEPS).bibliography,
  );
}

function fromSources(paperDir, where, b) {
  const texts = bibTexts(b);
  return texts.length === 0
    ? { ok: false, why: noTextWhy(where, b) }
    : { ok: true, paperDir, texts, notes: notes(b) };
}

/** The entries of one text TeX reads, each with its file. */
export function loadEntries(bib) {
  const file = rel(bib.path);
  return factEntries(bib).map((e) => ({ ...e, file }));
}

/** Every registry key a list of entries needs. Computed once so the requests go in one batch. */
export function keysFor(entries) {
  const keys = new Set();
  for (const e of entries) for (const k of allKeys(extractIds(e))) keys.add(k);
  return [...keys];
}

const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

/**
 * The facts of a run. `source` is the file the first database was read from (the only one, for a
 * paper with one), `sources` every one; `source_sha256` hashes those files' bytes, in order.
 */
export function buildFacts({ texts, entries, cache, cachePath }) {
  const withIds = entries.map((e) => {
    const ids = extractIds(e);
    return { ...e, ids, primary: primaryOf(ids), keys: allKeys(ids) };
  });
  const records = {};
  for (const e of withIds)
    for (const k of e.keys)
      if (!(k in records)) records[k] = recordFrom(k, cache[k]);
  return {
    schema: SCHEMA,
    source: rel(texts[0].path),
    sources: [...new Set(texts.map((b) => rel(b.path)))],
    source_kind: "bibtex",
    source_sha256: [...new Set(texts.map((b) => b.text))]
      .reduce((h, t) => h.update(t), createHash("sha256"))
      .digest("hex"),
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
  const opt = (name) =>
    (args.find((a) => a.startsWith(`--${name}=`)) ?? "")
      .split("=")
      .slice(1)
      .join("=");

  const found = bibliographyFrom(target);
  if (!found.ok) {
    console.error(`🛑 ${found.why}.`);
    return 1;
  }
  for (const n of found.notes) console.error(n);
  const { paperDir, texts } = found;
  const cachePath = opt("cache")
    ? resolve(opt("cache"))
    : join(paperDir, "repro", "refs-cache.json");
  const out = opt("out")
    ? resolve(opt("out"))
    : join(paperDir, "_build", "refs.facts.json");

  const entries = texts.flatMap(loadEntries);
  const names = [...new Set(texts.map((b) => basename(b.path)))].join(", ");
  if (!entries.length) {
    // 🔴 Zero entries is a suspect, not a success. Facts with an empty list would look like a
    // clean bibliography, so we do not write them at all and exit with a non-zero code.
    console.error(
      `🛑 parsed 0 entries out of ${[...new Set(texts.map((b) => rel(b.path)))].join(", ")}. Silence here would look like a clean bibliography.`,
    );
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
      await new Promise((r) => {
        setTimeout(r, 250);
      }); // both registries ask for a polite pace
    }
    if (fetched) saveCache(cachePath, cache);
  }

  const facts = buildFacts({ texts, entries, cache, cachePath });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(facts, null, 2)}\n`);
  const resolved = Object.values(facts.records).filter((r) => r.found).length;
  console.log(
    `📚 ${names} → ${rel(out)} (${entries.length} entries, ${Object.keys(facts.records).length} identifiers, ` +
      `${resolved} resolved${offline ? ", offline" : fetched ? `, +${fetched} fetched` : ", all from cache"})`,
  );
  return 0;
}

if (isMain(import.meta.url)) main(process.argv).then((c) => process.exit(c));
