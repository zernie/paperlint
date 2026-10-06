/**
 * extract-ref-facts.mjs beyond its harness: the edges of each reader (.bib, CrossRef, arXiv,
 * cache) and the command itself — sources, flags, the network loop (with `fetch` stubbed in
 * the child process), and the refusals.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import {
  bibliographyFrom,
  buildFacts,
  extractIds,
  loadCache,
  loadEntries,
  parseBib,
  primaryOf,
  readArxiv,
  readCrossref,
  recordFrom,
} from "./extract-ref-facts.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "extract-ref-facts.mjs",
);
const root = useTempDir("extract-ref-facts-");

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

test("sources: a .bib named is read as itself, as BibTeX; facts without a cache say so", async () => {
  const bib = join(root, "one.bib");
  writeFileSync(bib, "@misc{k, title={T}, year={2020}}\n");
  const found = bibliographyFrom(bib);
  assert.deepEqual([found.ok, found.texts.map((t) => t.path)], [true, [bib]]);
  const entries = await loadEntries(found.texts[0]);
  const facts = buildFacts({
    texts: found.texts,
    entries,
    cache: {},
    cachePath: null,
  });
  assert.deepEqual(
    [facts.source_kind, facts.cache, facts.sources],
    ["bibtex", null, [bib]],
  );
});

// ── the command ─────────────────────────────────────────────────────────────

const CROSSREF_OK = JSON.stringify({
  message: {
    title: ["Found"],
    author: [{ family: "A" }],
    issued: { "date-parts": [[2020]] },
  },
});
/** A paper.tex declaring `\bibliography{refs}`, with `preamble` before its document. */
const declaring = (preamble = "") =>
  `\\documentclass{article}\n${preamble}\\begin{document}x\\bibliography{refs}\\end{document}\n`;
writeTree(root, {
  "paper/paper.tex": declaring(),
  "paper/refs.bib":
    "@misc{a, author={A. A}, title={Found}, note={doi:10.1234/ok}}\n" +
    "@misc{b, author={B. B}, title={Lost}, note={doi:10.1234/down}}\n",
  "empty/paper.tex": declaring(),
  "empty/refs.bib": "% nothing cited\n",
  "notes/notes.txt": "A. A. Found. doi:10.1234/ok\n",
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
  "bib/paper.tex": declaring(),
  "thebib/paper.tex":
    "\\documentclass{article}\\begin{document}x\\begin{thebibliography}{9}\\bibitem{k} K.\\end{thebibliography}\\end{document}\n",
  "gone/paper.tex":
    "\\documentclass{article}\\begin{document}x\\bibliography{gone}\\end{document}\n",
  "switched/paper.tex":
    "\\documentclass{article}\\newif\\ifanon\\begin{document}x\\ifanon\\bibliography{anon}\\else\\bibliography{refs}\\fi\\end{document}\n",
  "switched/anon.bib": "@misc{anon1, title={A}, note={doi:10.1234/a}}\n",
  "switched/refs.bib": "@misc{refs1, title={R}, note={doi:10.1234/r}}\n",
  "bib/refs.bib": "@misc{k, title={T}, note={doi:10.1234/ok}}\n",
  // The bibliography is embedded in paper.tex; the refs.bib beside it is a stale build output.
  "inline/paper.tex": declaring(
    "\\begin{filecontents*}[overwrite]{refs.bib}\n" +
      "@misc{a, author={A. A}, title={Found}, note={doi:10.1234/ok}}\n" +
      "@misc{b, author={B. B}, title={Lost}, note={doi:10.1234/down}}\n" +
      "\\end{filecontents*}\n",
  ),
  "inline/refs.bib": "@misc{stale, title={Stale}, note={doi:10.1234/old}}\n",
  // A paper.tex that declares no bibliography: TeX reads none, whatever lies beside it.
  "plain/paper.tex":
    "\\documentclass{article}\\begin{document}x\\end{document}\n",
  "plain/refs.bib": "@misc{k, title={T}, note={doi:10.1234/ok}}\n",
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
        "📚 refs.bib → paper/_build/refs.facts.json (2 entries, 2 identifiers, 1 resolved, +1 fetched)\n",
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
      "📚 refs.bib → paper/_build/refs.facts.json (2 entries, 2 identifiers, 1 resolved, all from cache)\n",
    stderr: "",
  });
  const refresh = cli(["paper", "--refresh", "--quiet"], { nodeArgs: FETCH });
  assert.match(refresh.stdout, /1 resolved, \+1 fetched\)\n$/);
});

test("the paper file itself as the target, with --cache, --out and --offline", () => {
  const r = cli([
    join(root, "paper/refs.bib"),
    "--offline",
    `--cache=${join(root, "paper/repro/refs-cache.json")}`,
    `--out=${join(root, "out/facts.json")}`,
  ]);
  assert.deepEqual(r, {
    status: 0,
    stdout:
      "📚 refs.bib → out/facts.json (2 entries, 2 identifiers, 1 resolved, offline)\n",
    stderr: "",
  });
});

test("no target: the current directory", () => {
  const r = cli(["--offline"], { cwd: join(root, "paper") });
  assert.equal(r.status, 0, r.stderr);
});

test("refusals: nowhere to read from, a file that is not a .bib, and zero entries (not written as a clean bibliography)", () => {
  assert.deepEqual(cli([join(root, "nope"), "--offline"]), {
    status: 1,
    stdout: "",
    stderr: `🛑 ${join(root, "nope")} does not exist — nowhere to take a bibliography from.\n`,
  });
  assert.deepEqual(cli(["notes", "--offline"]), {
    status: 1,
    stdout: "",
    stderr: `🛑 no paper.tex in ${join(root, "notes")} — name the paper's .tex, or a .bib to read it alone.\n`,
  });
  assert.deepEqual(cli(["empty", "--offline"]), {
    status: 1,
    stdout: "",
    stderr:
      "🛑 parsed 0 entries out of empty/refs.bib. Silence here would look like a clean bibliography.\n",
  });
  // Guards: a file that is neither a .bib nor a .tex is named, not parsed as BibTeX, and nothing is written.
  assert.deepEqual(cli([join(root, "notes/notes.txt"), "--offline"]), {
    status: 1,
    stdout: "",
    stderr:
      "🛑 notes/notes.txt is neither a .bib nor a .tex — give the paper's directory, its .tex, or a .bib.\n",
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

test("🔴 a paper directory whose paper.tex embeds its .bib with [overwrite]: the embedded one is read, and the other refs.bib beside it named", () => {
  const r = cli(["inline", "--offline"]);
  // Guards: only materialized .bib files were looked for, so a paper with its bibliography in
  // `filecontents` was refused before a build and read from a stale refs.bib after an edit.
  assert.deepEqual(r, {
    status: 0,
    stdout:
      "📚 paper.tex → inline/_build/refs.facts.json (2 entries, 2 identifiers, 0 resolved, offline)\n",
    stderr:
      "⚠️ refs.bib holds other entries than the filecontents block that writes it — TeX reads the block\n",
  });
  const facts = JSON.parse(
    readFileSync(join(root, "inline/_build/refs.facts.json"), "utf8"),
  );
  // Each entry's line is its line in paper.tex, where the author edits it.
  assert.deepEqual(
    facts.entries.map((e) => [e.file, e.key, e.line]),
    [
      ["inline/paper.tex", "a", 3],
      ["inline/paper.tex", "b", 4],
    ],
  );
});

test("a paper.tex that declares no bibliography is refused with why — TeX reads no refs.bib beside it", () => {
  const why =
    "🛑 plain/paper.tex declares no bibliography (no \\bibliography, no \\addbibresource).\n";
  for (const target of ["plain", join(root, "plain/paper.tex")])
    assert.deepEqual(cli([target, "--offline"]), {
      status: 1,
      stdout: "",
      stderr: why,
    });
});

test("no database to read: written by hand, or declared and on no disk — each refused with why", () => {
  assert.deepEqual(
    cli(["thebib", "--offline"]).stderr,
    "🛑 thebib/paper.tex writes its references by hand in thebibliography — there is no database to read.\n",
  );
  assert.deepEqual(
    cli(["gone", "--offline"]).stderr,
    "🛑 gone/paper.tex declares gone (missing), and none of them is on disk.\n",
  );
});

test("a bibliography behind a switch: every candidate is read, and the run says so", () => {
  assert.deepEqual(cli(["switched", "--offline"]), {
    status: 0,
    stdout:
      "📚 anon.bib, refs.bib → switched/_build/refs.facts.json (2 entries, 2 identifiers, 0 resolved, offline)\n",
    stderr:
      "⚠️ which bibliography TeX reads depends on a switch or a macro — reading every candidate: anon, refs\n",
  });
});

test("an embedded entry whose key has no line of its own keeps line 0, not a shifted 0", async () => {
  const tex = join(root, "spaced.tex");
  writeFileSync(
    tex,
    declaring(
      "\\begin{filecontents*}{refs.bib}\n@misc{ spaced ,\n  note={arXiv:2101.00001}\n}\n\\end{filecontents*}\n",
    ),
  );
  const found = bibliographyFrom(tex);
  assert.deepEqual(
    (await loadEntries(found.texts[0])).map((e) => e.line),
    [0],
  );
});

// ── the planted papers of fixtures/paper-sources: the bibliography TeX reads ─────────

const PLANTED = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/paper-sources",
);

test.each([
  // [paper, what the run prints, the keys read] — tex-truth.json beside each paper is TeX's own answer.
  [
    "v1-stale",
    "⚠️ refs.bib holds other entries than the filecontents block that writes it — TeX reads the file (the block has no [overwrite])\n",
    "refs.bib",
    ["stale2020"],
  ],
  [
    "v2-overwrite",
    "⚠️ refs.bib holds other entries than the filecontents block that writes it — TeX reads the block\n",
    "paper.tex",
    ["inline2024"],
  ],
  ["v3-declared", "", "paper.bib", ["declared2023"]],
  ["v4-commented", "", "refs.bib", ["stale2020"]],
  ["v5-percent-entry", "", "paper.tex", ["inline2024", "dead2020"]],
])("%s: the bibliography TeX reads", (paper, stderr, file, keys) => {
  const out = join(root, "planted", `${paper}.json`);
  const r = cli([
    join(PLANTED, paper),
    "--offline",
    `--out=${out}`,
    `--cache=${join(root, "planted", "cache.json")}`,
  ]);
  assert.deepEqual([r.status, r.stderr], [0, stderr]);
  assert.match(r.stdout, new RegExp(`^📚 ${file} → `));
  const facts = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(
    facts.entries.map((e) => e.key),
    keys,
  );
});
