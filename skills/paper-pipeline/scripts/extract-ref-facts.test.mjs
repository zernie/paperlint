/**
 * extract-ref-facts.mjs beyond its harness: the edges of each reader (markdown list, .bib, CrossRef,
 * arXiv, cache) and the command itself — sources, flags, the network loop (with `fetch` stubbed in
 * the child process), and the refusals.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";
import {
  buildFacts,
  extractIds,
  loadCache,
  loadEntries,
  parseBib,
  parseMarkdownRefs,
  primaryOf,
  readArxiv,
  readCrossref,
  recordFrom,
  resolveSource,
} from "./extract-ref-facts.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "extract-ref-facts.mjs",
);
const root = useTempDir("extract-ref-facts-");

test("markdown: the list ends at the file's end or a second References heading; lines continue an entry", () => {
  assert.deepEqual(parseMarkdownRefs("# P\n\n## References"), []);
  const refs = parseMarkdownRefs(
    [
      "## References",
      "",
      "1. A. Author, B. Author. *A Title.* Venue,",
      "   continued 2021.",
      "2. *Untitled Authors.* 2019 note",
      "3. C. Writer 2018. *Late Year.* Venue",
      "4. No title here at all",
      "",
      "## References",
      "5. Never read. *X.* 2000",
    ].join("\n"),
  );
  assert.deepEqual(
    refs.map(({ n, line, authors, title, year, venue_text }) => ({
      n,
      line,
      authors,
      title,
      year,
      venue_text,
    })),
    [
      {
        n: 1,
        line: 3,
        authors: ["A. Author", "B. Author"],
        title: "A Title",
        year: "2021",
        venue_text: "Venue, continued 2021.",
      },
      {
        n: 2,
        line: 5,
        authors: [],
        title: "Untitled Authors",
        year: "2019",
        venue_text: "2019 note",
      },
      {
        n: 3,
        line: 6,
        authors: ["C. Writer 2018"],
        title: "Late Year",
        year: "2018",
        venue_text: "Venue",
      },
      {
        n: 4,
        line: 7,
        authors: [],
        title: null,
        year: null,
        venue_text: "No title here at all",
      },
    ],
  );
});

test(".bib: a key the text spells with spaces has no line; a missing title or year is null, not empty", async () => {
  const [entry] = await parseBib(
    "@misc{ spaced ,\n  note={see arXiv:2101.00001}\n}\n",
  );
  assert.deepEqual(
    {
      line: entry.line,
      title: entry.title,
      year: entry.year,
      authors: entry.authors,
      raw: entry.raw,
    },
    {
      line: 0,
      title: null,
      year: null,
      authors: [],
      raw: "see arXiv:2101.00001",
    },
  );
});

test(".bib from a parser that returns no fields, or list and number fields: joined and printed, not dropped", async () => {
  const load = async () => ({
    parse: () => ({
      entries: [
        { key: "bare" },
        {
          key: "odd",
          fields: {
            title: ["Split", "Title"],
            year: 2021,
            note: null,
            author: [{ firstName: "Ada", lastName: "Lovelace" }],
          },
        },
      ],
    }),
  });
  const [bare, odd] = await parseBib("@misc{bare,}\n@misc{odd,}\n", { load });
  assert.deepEqual(
    [
      bare,
      { title: odd.title, year: odd.year, authors: odd.authors, raw: odd.raw },
    ],
    [
      {
        n: 1,
        line: 1,
        key: "bare",
        raw: "",
        authors: [],
        truncated: false,
        title: null,
        year: null,
        venue_text: "",
        doi_field: null,
      },
      {
        title: "Split Title",
        year: "2021",
        authors: ["Ada Lovelace"],
        raw: "Ada Lovelace Split Title 2021",
      },
    ],
  );
});

test("identifiers: a declared DOI field comes first; an entry without text fields has none", () => {
  const ids = extractIds({
    doi_field: "10.1111/field",
    raw: "doi:10.2222/text.",
  });
  assert.deepEqual(ids, { arxiv: [], doi: ["10.1111/field", "10.2222/text"] });
  assert.equal(primaryOf(ids), "doi:10.1111/field");
  const none = extractIds({});
  assert.deepEqual(none, { arxiv: [], doi: [] });
  assert.equal(primaryOf(none), null);
});

test("CrossRef: every fallback — no message, the date sources, scalar title/subtitle/venue, nameless authors", () => {
  assert.equal(readCrossref("{}"), null);
  const rec = (message) => readCrossref(JSON.stringify({ message }));
  assert.deepEqual(
    rec({
      title: "Scalar",
      subtitle: "Sub",
      author: [{ family: "F" }, { name: "Org" }, {}],
      "container-title": "Journal",
      "published-print": { "date-parts": [[2019]] },
    }),
    {
      title: "Scalar: Sub",
      authors: ["F", "Org", ""],
      year: "2019",
      venue: "Journal",
      journalRef: null,
      doi: null,
      error: false,
    },
  );
  assert.equal(
    rec({ title: ["T"], "published-online": { "date-parts": [[2018]] } }).year,
    "2018",
  );
  assert.deepEqual(rec({ title: ["T"] }), {
    title: "T",
    authors: [],
    year: null,
    venue: undefined,
    journalRef: null,
    doi: null,
    error: false,
  });
});

test("arXiv: an entry with no published date and no title", () => {
  assert.deepEqual(readArxiv("<feed><entry><id>x</id></entry></feed>"), {
    title: null,
    authors: [],
    year: null,
    venue: null,
    journalRef: null,
    doi: null,
    error: false,
  });
});

test("a record: a hand-written cache entry with no status, an undated response, and a 200 naming no work", () => {
  assert.deepEqual(recordFrom("arxiv:2101.00001", {}), {
    cached: true,
    registry: "arxiv",
    httpStatus: null,
    fetched: null,
  });
  assert.deepEqual(
    recordFrom("doi:10.1234/x", { httpStatus: 200, body: "{}" }),
    {
      cached: true,
      registry: "crossref",
      httpStatus: 200,
      fetched: null,
      found: false,
    },
  );
});

test("cache: no path and a corrupt file both read as empty", () => {
  const corrupt = join(root, "corrupt.json");
  writeFileSync(corrupt, "{ nope");
  assert.deepEqual([loadCache(undefined), loadCache(corrupt)], [{}, {}]);
});

test("sources: a file names itself; a .bib is read as BibTeX; facts without a cache say so", async () => {
  const bib = join(root, "one.bib");
  writeFileSync(bib, "@misc{k, title={T}, year={2020}}\n");
  assert.equal(resolveSource(bib), bib);
  const entries = await loadEntries(bib);
  const facts = buildFacts({
    source: bib,
    text: "",
    entries,
    cache: {},
    cachePath: null,
  });
  assert.deepEqual([facts.source_kind, facts.cache], ["bibtex", null]);
});

// ── the command ─────────────────────────────────────────────────────────────

const CROSSREF_OK = JSON.stringify({
  message: {
    title: ["Found"],
    author: [{ family: "A" }],
    issued: { "date-parts": [[2020]] },
  },
});
writeTree(root, {
  "paper/paper.md":
    "## References\n\n1. A. A. *Found.* doi:10.1234/ok\n2. B. B. *Lost.* doi:10.1234/down\n",
  "empty/paper.md": "# Nothing cited\n",
  // `fetch` in the child: 10.1234/down fails at the transport, anything else is a CrossRef hit.
  "fetch.mjs":
    `globalThis.fetch = async (url) => {\n` +
    `  if (url.includes("down")) throw new Error("network down");\n` +
    `  return { status: 200, text: async () => ${JSON.stringify(CROSSREF_OK)} };\n` +
    `};\n`,
  // The optional .bib parser, uninstalled — and broken in some other way.
  "no-parser.mjs":
    "import { register } from 'node:module';\n" +
    "register('data:text/javascript,' + encodeURIComponent(\"export async function resolve(s, c, next) { if (s === '@retorquere/bibtex-parser') throw Object.assign(new Error('gone'), { code: 'ERR_MODULE_NOT_FOUND' }); return next(s, c); }\"));\n",
  "bad-parser.mjs":
    "import { register } from 'node:module';\n" +
    "register('data:text/javascript,' + encodeURIComponent(\"export async function resolve(s, c, next) { if (s === '@retorquere/bibtex-parser') throw Object.assign(new Error('broken install'), { code: 'EACCES' }); return next(s, c); }\"));\n",
  "bib/refs.bib": "@misc{k, title={T}, note={doi:10.1234/ok}}\n",
});
const cli = (args, { cwd = root, nodeArgs = [] } = {}) =>
  runNode(SCRIPT, args, {
    cwd,
    nodeArgs,
    env: { CLAUDE_PROJECT_DIR: root },
  });
const FETCH = ["--import", join(root, "fetch.mjs")];

test("online: hits are fetched and cached, a transport failure is named and stays missing", () => {
  const r = cli(["paper"], { nodeArgs: FETCH });
  assert.deepEqual(
    {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      cached: Object.keys(
        JSON.parse(readFileSync(join(root, "paper/repro/refs-cache.json"))),
      ),
    },
    {
      status: 0,
      stdout:
        "📚 paper.md → paper/_build/refs.facts.json (2 entries, 2 identifiers, 1 resolved, +1 fetched)\n",
      stderr: "   … doi:10.1234/down: network down\n",
      cached: ["doi:10.1234/ok"],
    },
  );
});

test("online again: cached keys are not refetched; --quiet hides the failure; --refresh refetches", () => {
  const again = cli(["paper", "--quiet"], { nodeArgs: FETCH });
  assert.deepEqual(again, {
    status: 0,
    stdout:
      "📚 paper.md → paper/_build/refs.facts.json (2 entries, 2 identifiers, 1 resolved, all from cache)\n",
    stderr: "",
  });
  const refresh = cli(["paper", "--refresh", "--quiet"], { nodeArgs: FETCH });
  assert.match(refresh.stdout, /1 resolved, \+1 fetched\)\n$/);
});

test("the paper file itself as the target, with --cache, --out and --offline", () => {
  const r = cli([
    join(root, "paper/paper.md"),
    "--offline",
    `--cache=${join(root, "paper/repro/refs-cache.json")}`,
    `--out=${join(root, "out/facts.json")}`,
  ]);
  assert.deepEqual(r, {
    status: 0,
    stdout:
      "📚 paper.md → out/facts.json (2 entries, 2 identifiers, 1 resolved, offline)\n",
    stderr: "",
  });
});

test("no target: the current directory", () => {
  const r = cli(["--offline"], { cwd: join(root, "paper") });
  assert.equal(r.status, 0, r.stderr);
});

test("refusals: nowhere to read from, and zero entries (not written as a clean bibliography)", () => {
  assert.deepEqual(cli([join(root, "nope"), "--offline"]), {
    status: 1,
    stdout: "",
    stderr: `🛑 no paper.md, draft.md, refs.bib, build/custom.bib under ${join(root, "nope")} — nowhere to take a bibliography from.\n`,
  });
  assert.deepEqual(cli(["empty", "--offline"]), {
    status: 1,
    stdout: "",
    stderr:
      "🛑 parsed 0 entries out of empty/paper.md. Silence here would look like a clean bibliography.\n",
  });
});

test(".bib without its optional parser: the error names the install; any other failure is not masked", () => {
  const missing = cli(["bib", "--offline"], {
    nodeArgs: ["--import", join(root, "no-parser.mjs")],
  });
  assert.equal(missing.status, 1);
  assert.match(
    missing.stderr,
    /parsing \.bib requires @retorquere\/bibtex-parser[\s\S]*Install: {2}npm i -D @retorquere\/bibtex-parser/,
  );
  const broken = cli(["bib", "--offline"], {
    nodeArgs: ["--import", join(root, "bad-parser.mjs")],
  });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /broken install/);
  assert.doesNotMatch(broken.stderr, /npm i -D/);
});
