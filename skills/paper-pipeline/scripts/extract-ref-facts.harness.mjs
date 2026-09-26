/**
 * Colocated test of the `extract-ref-facts.mjs` extractor.
 * Run: `npx vigiles test .claude/skills/paper-pipeline/scripts/extract-ref-facts.harness.mjs`
 *
 * ORDER IS LOAD-BEARING: first we prove that on CORRECT input the extractor returns the facts it
 * promises, and only then — that on broken input it refuses to write. An extractor that silently
 * writes empty facts is scarier than a missing one: empty bibliography reads as clean.
 *
 * 🔴 THREE MEASUREMENTS HERE — THESE ARE THREE DEFECTS THAT LIVED THE ENTIRE LIFE OF THE PREDECESSOR. Each
 * is pinned by an assertion on a REAL repository file, not a fixture, because all three
 * held exactly because nobody ever passed the real file:
 *   1. `refs.bib` was not in the list of sources (`resolveSource`);
 *   2. the regex `.bib` required `}` on a separate line and gave 0 entries on both our files;
 *   3. in `.bib` an author is written "LastName, FirstName", but comparison took the last token.
 *
 * 🔴 NO NETWORK. Registry answers — fixtures in a cache file, read by the same code that writes
 * a real request. A test that needs the internet is skipped in CI, and a skipped check
 * is indistinguishable from one that passed.
 *
 * 🔴 Assertions — AT MODULE TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as success, so an exported test object would report ✓ without running anything.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_PAPERS_ROOT,
  PAPERS_DIR_FIELD,
  settingsOf,
} from "../../../lib/paper-config.mjs";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = consumerRoot();
const X = await import(join(HERE, "extract-ref-facts.mjs"));

// 🔴 PAPERS ROOT — FROM THE DECLARATION, NOT BY THE FIRST CONSUMER'S DIRECTORY NAME (12.09.2026).
// `package.json` → `paperlint.papersDir`, default `papers`. The same key is read by
// ESLint config, hook and skills — the mechanism was moved into the package at step 2, and a second way to know
// the same thing would be a second truth.
//
// Real consumer papers — ADDITION to fixture, "if they exist — check against them too".
// Absence is lawful and silently skipped; the test itself is carried by the fixture, and its absence is caught
// with a loud zero below.
//
// 🔴 READ FROM DISK, NOT LISTED BY NAME (12.09.2026). There used to be a list of two
// paper names of the first consumer. A list of names in the PACKAGE is wrong twice: a different consumer has no such
// directories, meaning the loop makes no iteration and prints success having checked zero
// files; and it names others' unpublished works in a repository everyone reads.
// A directory on disk answers the same question without knowing any name in advance.
const PAPERS_ROOT = join(
  ROOT,
  settingsOf(ROOT)?.[PAPERS_DIR_FIELD] ?? DEFAULT_PAPERS_ROOT,
);
const REAL_PAPERS = existsSync(PAPERS_ROOT)
  ? readdirSync(PAPERS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "extract-ref-facts-")));
// Cleanup is attached IMMEDIATELY: assertions throw, and "rmSync at end of file" does not execute precisely in those
// runs that are red.
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

// ── 1. DEFECT #1: `refs.bib` must be in the list of sources ─────────────────
{
  assert.ok(
    X.SOURCE_ORDER.includes("refs.bib"),
    `refs.bib missing from SOURCE_ORDER — this is the defect that kept the .bib leg from ever opening: ${X.SOURCE_ORDER.join(", ")}`,
  );
  // 🔴 SUBJECT — FIXTURE, real papers ADDITION (12.09.2026). There used to be only a loop over
  // our two papers with `continue` if file doesn't exist. In this repo they exist, and test is green;
  // in the extracted pipeline their directories WON'T EXIST — both loops make no iteration, and
  // harness prints success having checked zero files. "Green over void", a class this base has paid for thrice. Fixture makes an empty run INEXPRESSIBLE: it always lies nearby.
  //
  // ⚠️ Directory, not file: `resolveSource` returns the path itself if it IS A FILE, and only for
  // a directory descends the `SOURCE_ORDER`. A fixture-file would check the wrong branch.
  {
    const dir = join(HERE, "fixtures", "real-bib");
    assert.equal(
      X.resolveSource(dir),
      join(dir, "refs.bib"),
      "resolveSource cannot find the frozen real .bib — .bib leg is dead again",
    );
  }
  for (const paper of REAL_PAPERS) {
    const dir = join(PAPERS_ROOT, paper);
    if (!existsSync(join(dir, "refs.bib"))) continue;
    assert.equal(
      X.resolveSource(dir),
      join(dir, "refs.bib"),
      `resolveSource cannot find real refs.bib for ${paper} — .bib leg is dead again`,
    );
  }
}

// ── 2. DEFECT #2: real .bib parses, and entry count matches ───────
//
// REAL files, not fixture: the old parser failed on the form `}}` at the end of the last
// field, and a hand-written fixture almost certainly would close the entry on its own line — that is,
// the test would pass but the corpus would not. The expected count comes from the file itself (`^@`), not
// hardcoded: a constant grows stale on the first added entry.
{
  // Counter of parsed sources, checked after the loop: a check that prints "passed"
  // but says nothing about HOW MANY files it opened — this is a counter that counts what it ignores.
  let parsed = 0;
  const sources = [
    join(HERE, "fixtures", "real-bib", "refs.bib"), // always lies nearby
    ...REAL_PAPERS.map((p) => join(PAPERS_ROOT, p, "refs.bib")),
  ];
  for (const f of sources) {
    const paper = f.includes("fixtures")
      ? "fixtures/real-bib"
      : f.split("/").slice(-2)[0];
    if (!existsSync(f)) continue;
    parsed++;
    const text = readFileSync(f, "utf8");
    const want = (text.match(/^@\w+\{/gm) ?? []).length;
    const got = await X.parseBib(text);
    assert.ok(
      want > 0,
      `${paper}/refs.bib: no @… entries in file — fixture is broken`,
    );
    assert.equal(
      got.length,
      want,
      `${paper}/refs.bib: parsed ${got.length} entries out of ${want}`,
    );
    for (const e of got) {
      assert.ok(e.title, `${paper}: entry ${e.key} has no title`);
      assert.ok(
        e.line > 0,
        `${paper}: entry ${e.key} has no source line — nowhere to report the finding`,
      );
    }
  }
  // Loud zero. Fixture makes it unreachable today — and precisely why the assertion stands: it
  // catches not absence of papers (that is lawful), but disappearance of the fixture itself, after which the loop
  // will start printing success without opening any file.
  assert.ok(
    parsed > 0,
    "parsed ZERO .bib files. This is not 'nothing to check', but 'check did not find its subject': " +
      "the frozen fixture fixtures/real-bib/refs.bib must always lie in the repository.",
  );
}

// ── 3b. INSTITUTION DOES NOT DISAPPEAR ──────────────────────────────────────────────
//
// `author={{Adversa AI}}` — double brace means "one name whole, do not parse". Parser
// returns such as `{name}`, WITHOUT `lastName`, and this is correct: an organization has no surname.
// Measurement 17.09 on real aisec-2026: eleven entries out of fifty-one came back
// with `authors = []`, because joinName didn't know this form. Failure toward SILENCE — checking against
// such entries found nothing and looked like passing.
{
  const bib = `@misc{inst,
  author={{Adversa AI}},
  title={A Report}, year={2026}}
@misc{inst2,
  author={{sh-guard contributors}},
  title={Another}, year={2026}}`;
  const es = await X.parseBib(bib);
  assert.deepEqual(
    es.map((e) => e.authors),
    [["Adversa AI"], ["sh-guard contributors"]],
    `institution lost or torn apart: ${JSON.stringify(es.map((e) => e.authors))}`,
  );
  assert.equal(es[0].truncated, false, "institution is not `and others`");
}

// ── 3c. …AND SINGLE BRACE STILL PARSES AS PERSON ─────────────
//
// Second half. Without it the fix above is indistinguishable from "stopped parsing names at all":
// single brace — ordinary author, and order "LastName, FirstName" must be unwound.
{
  const bib = `@misc{human, author={Adversa, Alice}, title={T}, year={2026}}`;
  const [e] = await X.parseBib(bib);
  assert.deepEqual(
    e.authors,
    ["Alice Adversa"],
    `single brace must parse as person: ${JSON.stringify(e.authors)}`,
  );
}

// ── 3. DEFECT #3: name from .bib is converted to order "FirstName LastName" ─────────────
//
// In BibTeX they write `Jimenez, Carlos E.`, and the "last alphabetic token" of such a string is `e`.
// The rule compares exactly the last token, so order must be unwound HERE.
{
  const bib = `@inproceedings{k1,
  author={Jimenez, Carlos E. and Di Penta, Massimiliano and others},
  title={A Title}, booktitle={ICLR}, year={2024}, note={arXiv:2310.06770}}`;
  const [e] = await X.parseBib(bib);
  assert.deepEqual(
    e.authors,
    ["Carlos E. Jimenez", "Massimiliano Di Penta"],
    `name order not unwound: ${JSON.stringify(e.authors)}`,
  );
  assert.equal(
    e.truncated,
    true,
    "`and others` is et al. in BibTeX format, and it must be marked as truncation",
  );
  assert.deepEqual(X.extractIds(e), { arxiv: ["2310.06770"], doi: [] });
}

// ── 4. arXiv-DOI goes to arXiv, NOT to CrossRef ───────────────────────────────
//
// Measurement 26.08: `api.crossref.org/works/10.48550%2FarXiv.2107.03374` → HTTP 404 "Resource not
// found" on a completely real DOI in <paper-b>/refs.bib. Asking CrossRef,
// gate `id-resolves` would declare the correct entry broken.
{
  assert.equal(X.routeOf("doi:10.48550/arXiv.2107.03374").registry, "arxiv");
  assert.ok(
    X.routeOf("doi:10.48550/arXiv.2107.03374").url.includes("2107.03374"),
  );
  assert.equal(X.routeOf("doi:10.1145/3597503.3623333").registry, "crossref");
  assert.equal(X.routeOf("arxiv:2310.06770").registry, "arxiv");
}

// ── 5. registry readers work on RAW bodies ─────────────────────────────
//
// Cache stores raw responses precisely for this: every fabricated title this base
// shipped was found by reading the registry's response. A cache of parsed entries would leave readers
// uncovered, appearing covered.
{
  const atom = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/0000.00000v1</id>
    <title>A &amp; B: A Study</title>
    <published>2025-03-12T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <author><name>Grace Hopper</name></author>
    <arxiv:journal_ref>Proc. ICSE 2025</arxiv:journal_ref>
  </entry>
</feed>`;
  const a = X.readArxiv(atom);
  assert.equal(a.title, "A & B: A Study", "XML entities not decoded");
  assert.deepEqual(a.authors, ["Ada Lovelace", "Grace Hopper"]);
  assert.equal(a.year, "2025");
  assert.equal(a.journalRef, "Proc. ICSE 2025");
  assert.equal(a.error, false);
  assert.equal(
    X.readArxiv(`<feed xmlns="http://www.w3.org/2005/Atom"></feed>`),
    null,
    "feed without <entry> must return null",
  );

  // CrossRef puts subtitle after colon in SEPARATE field; joining must return it,
  // otherwise correct entry gets similarity 0.69 and is declared fabricated.
  const cr = JSON.stringify({
    message: {
      title: ["Variability-Aware Static Analysis at Scale"],
      subtitle: ["An Empirical Study"],
      author: [{ family: "Liebig" }, { family: "von Rhein" }],
      issued: { "date-parts": [[2018]] },
      "container-title": ["TOSEM"],
    },
  });
  const c = X.readCrossref(cr);
  assert.equal(
    c.title,
    "Variability-Aware Static Analysis at Scale: An Empirical Study",
  );
  assert.equal(c.year, "2018");
  assert.deepEqual(c.authors, ["Liebig", "von Rhein"]);
}

// ── 6. recording facts: registry response → record, and UNparsed response is also a fact ─
{
  const key = "arxiv:2310.06770";
  const ok = X.recordFrom(key, {
    httpStatus: 200,
    body: `<feed><entry><title>T</title><author><name>A B</name></author><published>2023-01-01T00:00:00Z</published></entry></feed>`,
  });
  assert.equal(ok.found, true);
  assert.equal(ok.registry, "arxiv");
  assert.equal(
    X.recordFrom(key, { httpStatus: 404, body: "" }).found,
    undefined,
    "non-200 must not be declared found",
  );
  assert.equal(
    X.recordFrom(key, undefined).cached,
    false,
    "missing response is a fact 'never asked', not 'no entry'",
  );
  const broken = X.recordFrom("doi:10.1145/x", {
    httpStatus: 200,
    body: "{not json",
  });
  assert.equal(broken.found, false);
  assert.ok(
    broken.parse_error,
    "unreadable response must leave reason, not silently disappear",
  );
}

// ── 7. markdown: reference list, source lines, `et al.`, appendix ───
{
  const md = [
    "# Paper",
    "",
    "## 1. Intro",
    "",
    "Prose.",
    "",
    "## References",
    "",
    "1. C. Yang, Z. Zhao, L. Zhang. *KNighter: Transforming Static Analysis.* arXiv:2503.09002, 2025.",
    "2. Z. Xiang et al. *Another Work.* ICSE 2024. arXiv:2401.00001",
    "",
    "## Appendix A",
    "",
    "1. Not a reference at all.",
    "",
  ].join("\n");
  const es = X.parseMarkdownRefs(md);
  assert.equal(
    es.length,
    2,
    `heading must close the reference list, parsed ${es.length}`,
  );
  assert.equal(
    es[0].line,
    9,
    `line of first entry is ${es[0].line}, but it is ninth in file`,
  );
  assert.equal(es[0].title, "KNighter: Transforming Static Analysis");
  assert.equal(es[1].truncated, true, "`et al.` must be marked as truncation");
  assert.deepEqual(es[1].authors, ["Z. Xiang"]);
  assert.equal(es[1].year, "2024");
}

// ── 8. `## References` inside ```-block does NOT open list ──────────────────
// Papers in this repo cite their own markup in pieces; the old `split` would open
// bibliography in the middle of a code example.
{
  const md = [
    "# P",
    "",
    "## Body",
    "",
    "```md",
    "## References",
    "",
    "1. Fake. *X.* arXiv:1111.11111",
    "```",
    "",
  ].join("\n");
  assert.deepEqual(
    X.parseMarkdownRefs(md),
    [],
    "heading inside ```-block is not a heading",
  );
}

// ── 9. CLI: ZERO ENTRIES — REFUSAL, not empty facts ─────────────────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "empty");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "paper.md"), "# P\n\nNo links at all.\n");
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(
    r.status,
    1,
    `empty bibliography must return non-zero code, returned ${r.status}`,
  );
  assert.ok(
    /ZERO|0 entries/u.test(r.stderr),
    `no reason in stderr: ${r.stderr}`,
  );
  assert.ok(
    !existsSync(join(dir, "_build", "refs.facts.json")),
    "facts with empty list written to disk — would be read as clean bibliography",
  );
}

// ── 10. CLI: no source — also refusal, not silence ─────────────────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "nosrc");
  mkdirSync(dir, { recursive: true });
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  assert.ok(
    /refs\.bib/u.test(r.stderr),
    "message must list sources, including refs.bib",
  );
}

// ── 11. end-to-end: real paper → facts, freshness is computed ───────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "e2e");
  mkdirSync(join(dir, "repro"), { recursive: true });
  const paper = [
    "# P",
    "",
    "## References",
    "",
    "1. A. Lovelace, G. Hopper. *A Study.* arXiv:2503.09002, 2025.",
    "",
  ].join("\n");
  writeFileSync(join(dir, "paper.md"), paper);
  writeFileSync(
    join(dir, "repro", "refs-cache.json"),
    JSON.stringify({
      "arxiv:2503.09002": {
        httpStatus: 200,
        body: `<feed><entry><title>A Study</title><author><name>Ada Lovelace</name></author><author><name>Grace Hopper</name></author><published>2025-01-01T00:00:00Z</published></entry></feed>`,
      },
    }),
  );
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const facts = JSON.parse(
    readFileSync(join(dir, "_build", "refs.facts.json"), "utf8"),
  );
  assert.equal(facts.schema, X.SCHEMA);
  assert.equal(facts.entries.length, 1);
  assert.equal(facts.records["arxiv:2503.09002"].found, true);
  const { createHash } = await import("node:crypto");
  assert.equal(
    facts.source_sha256,
    createHash("sha256").update(paper).digest("hex"),
    "source sha256 does not match — rule `fresh` could not catch stale facts",
  );
}

console.log(
  "✓ extract-ref-facts: refs.bib in sources, both real .bib parse completely, name order unwound, " +
    "arXiv-DOI does not go to CrossRef, registry readers run on raw bodies, zero entries = refusal",
);
