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
import { plantedOnDisk, recordOnDisk } from "../../../test/recorded-paper.ts";
import { bibliographyUnreadWhy } from "#src/paper-sources";
import {
  bibliographyFrom,
  buildFacts,
  extractIds,
  loadCache,
  loadEntries,
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

test(".bib: an entry's line is where its `@` stands; a missing title or year is null, not empty", () => {
  const bib = join(root, "lines.bib");
  writeFileSync(
    bib,
    "% a comment\n\n@misc{ spaced ,\n  note={see arXiv:2101.00001}\n}\n",
  );
  const [entry] = loadEntries(bibliographyFrom(bib).texts[0]);
  assert.deepEqual(
    {
      line: entry.line,
      title: entry.title,
      year: entry.year,
      authors: entry.authors,
      raw: entry.raw,
    },
    {
      line: 3,
      title: null,
      year: null,
      authors: [],
      raw: "see arXiv:2101.00001",
    },
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
  const entries = loadEntries(found.texts[0]);
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
  "bib/paper.tex": declaring(),
  "switched/paper.tex":
    "\\documentclass{article}\\newif\\ifanon\\begin{document}x\\ifanon\\bibliography{anon}\\else\\bibliography{refs}\\fi\\end{document}\n",
  "switched/anon.bib": "@misc{anon1, title={A}, note={doi:10.1234/a}}\n",
  "switched/refs.bib": "@misc{refs1, title={R}, note={doi:10.1234/r}}\n",
  "bib/refs.bib": "@misc{k, title={T}, note={doi:10.1234/ok}}\n",
  // The bibliography is embedded in paper.tex; the refs.bib beside it is what TeX wrote from the block.
  "inline/paper.tex": declaring(
    "\\begin{filecontents*}[overwrite]{refs.bib}\n" +
      "@misc{a, author={A. A}, title={Found}, note={doi:10.1234/ok}}\n" +
      "@misc{b, author={B. B}, title={Lost}, note={doi:10.1234/down}}\n" +
      "\\end{filecontents*}\n",
  ),
  "inline/refs.bib":
    "@misc{a, author={A. A}, title={Found}, note={doi:10.1234/ok}}\n" +
    "@misc{b, author={B. B}, title={Lost}, note={doi:10.1234/down}}\n",
  // A paper that was never built has no record: nothing says which bibliography TeX reads.
  "unbuilt/paper.tex": declaring(),
  "unbuilt/refs.bib": "@misc{k, title={T}, note={doi:10.1234/ok}}\n",
});
/** What a build records for a paper whose bibliography is the file `db` the author keeps. */
const keeps = (db = "refs.bib") => ({
  inputs: [
    ["paper.tex", "body"],
    [db, "preamble"],
  ],
  databases: [db],
});
for (const dir of ["paper", "empty", "bib"])
  recordOnDisk(join(root, dir), keeps());
// bibtex opened refs.bib only: the switch took its `\else`.
recordOnDisk(join(root, "switched"), keeps());
recordOnDisk(join(root, "inline"), {
  inputs: [["paper.tex", "body"]],
  written: ["refs.bib"],
  databases: ["refs.bib"],
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

test("refusals: no bibliography to read (in bibliographyAt's words), and zero entries (not written as a clean bibliography)", () => {
  // The path → bibliography vocabulary is tested once, beside bibliographyAt (src/paper-sources.ts).
  // Here: that the command speaks it, and stops.
  const notes = join(root, "notes/notes.txt");
  assert.deepEqual(cli([notes, "--offline"]), {
    status: 1,
    stdout: "",
    stderr: `🛑 ${bibliographyUnreadWhy({ kind: "not-bib-or-tex", path: notes })}.\n`,
  });
  assert.deepEqual(cli(["empty", "--offline"]), {
    status: 1,
    stdout: "",
    stderr:
      "🛑 parsed 0 entries out of empty/refs.bib. Silence here would look like a clean bibliography.\n",
  });
});

test("🔴 a paper directory whose paper.tex embeds its .bib: the entries are read from the block that wrote it, where the author edits them", () => {
  const r = cli(["inline", "--offline"]);
  // Guards: only materialized .bib files were looked for, so a paper with its bibliography in
  // `filecontents` was refused before a build and read from a stale refs.bib after an edit.
  assert.deepEqual(r, {
    status: 0,
    stdout:
      "📚 paper.tex → inline/_build/refs.facts.json (2 entries, 2 identifiers, 0 resolved, offline)\n",
    stderr: "",
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

test("a bibliography behind a switch: the database bibtex opened is read, not every candidate", () => {
  assert.deepEqual(cli(["switched", "--offline"]), {
    status: 0,
    stdout:
      "📚 refs.bib → switched/_build/refs.facts.json (1 entries, 1 identifiers, 0 resolved, offline)\n",
    stderr: "",
  });
});

test("🔴 a paper that was not built is refused — run `npx paperlint build` first — never read from its source", () => {
  assert.deepEqual(cli(["unbuilt", "--offline"]), {
    status: 1,
    stdout: "",
    stderr: `🛑 ${join(root, "unbuilt")} has not been built — run \`npx paperlint build\` first, which records the databases bibtex reads.\n`,
  });
});

test("an embedded entry's line is its line in paper.tex", () => {
  const block = "@misc{ spaced ,\n  note={arXiv:2101.00001}\n}\n";
  writeTree(root, {
    "spaced/paper.tex": declaring(
      `\\begin{filecontents*}{refs.bib}\n${block}\\end{filecontents*}\n`,
    ),
    "spaced/refs.bib": block,
  });
  recordOnDisk(join(root, "spaced"), {
    inputs: [["paper.tex", "body"]],
    written: ["refs.bib"],
    databases: ["refs.bib"],
  });
  const found = bibliographyFrom(join(root, "spaced", "paper.tex"));
  assert.deepEqual(
    loadEntries(found.texts[0]).map((e) => e.line),
    [3],
  );
});

// ── the planted papers of fixtures/paper-sources, laid out as a build leaves them ─────

test.each([
  // [paper, the file read, the keys read] — tex-truth.json beside each paper is TeX's own answer: the
  // databases bibtex opened. A `.bib` TeX wrote from a block is read from the block (paper.tex).
  ["v1-stale", "refs.bib", ["stale2020"]],
  ["v2-overwrite", "paper.tex", ["inline2024"]],
  ["v3-declared", "paper.bib", ["declared2023"]],
  ["v4-commented", "refs.bib", ["stale2020"]],
  // What bibtex reads beyond these — a malformed entry, or one behind `%` or inside `@comment{…}` —
  // the build's post-build check names (src/references.ts).
  ["v5-percent-entry", "paper.tex", ["inline2024"]],
  ["v6-unclosed", "refs.bib", ["a1", "a3"]],
  ["v13-percent-text", "refs.bib", ["ok1"]],
  ["v8-jobname", "paper.tex", ["jkey"]],
])("%s: the bibliography bibtex opened", (paper, file, keys) => {
  const dir = join(root, "planted", paper);
  plantedOnDisk(dir, paper);
  const out = join(root, "planted", `${paper}.json`);
  const r = cli([
    dir,
    "--offline",
    `--out=${out}`,
    `--cache=${join(root, "planted", "cache.json")}`,
  ]);
  assert.deepEqual([r.status, r.stderr], [0, ""]);
  assert.match(r.stdout, new RegExp(`^📚 ${file} → `));
  const facts = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(
    facts.entries.map((e) => e.key),
    keys,
  );
});
