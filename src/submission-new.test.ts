/** `paperlint submission new`: what it reads and sends, the dry run, the save that records the id, the refusals. */
import assert from "node:assert/strict";
import { map } from "remeda";
import { test } from "vitest";
import { builtPaper } from "../test/recorded-fixture.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { ok } from "./domain/result.ts";
import { titleOf } from "./submission.ts";
import {
  PAPER,
  SITE,
  files,
  fakePortal,
  CHECK,
  run,
  AUTHORS,
  facts,
  ABSTRACT_TEX,
  DEFAULT_TEX,
  newFiles,
  WANT,
} from "../test/submission-fixtures.ts";

test("new: a dry run by default — title from \\title, abstract from \\begin{abstract} with the author's macro expanded, the declared authors, the PDF", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new" }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.errs, []);
  assert.deepEqual(r.seen[0]?.calls, [["create", WANT, { save: false }]]);
  assert.deepEqual(r.out, [
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    "title         Agents That Lie",
    "author 1      Ada Lovelace <ada@example.org>, Analytical",
    "author 2      Bob Bobson <bob@example.org>",
    "abstract      17 words:",
    `  ${WANT.abstract}`,
    "dry run — the portal checked the new submission and kept nothing; --save creates it for real",
    "HTTP          200",
    "valid         yes",
    "changes       new, title, abstract, authors, submission",
    `do on the site, ${SITE}/paper/<its number> — paperlint sends only the title, the abstract, the authors and the PDF:`,
    "  - PC conflicts (HotCRP's API takes them as pc_conflicts; paperlint does not send them)",
    "  - topics, and every field the venue adds (paper type, artifact, consent boxes …)",
    "  - then mark it submitted: npx paperlint submission update papers/p --submit (a dry run; --save after your yes)",
  ]);
  // A dry run writes nothing.
  assert.deepEqual(
    JSON.parse(
      new TextDecoder().decode(
        fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ??
          new Uint8Array(),
      ),
    ),
    { extends: "../../venue.jsonc", authors: AUTHORS },
  );
});

test("🔴 new --save: the id the portal chose is written into paperlint.json, and `show` is the next command", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new", save: true }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.seen[0]?.calls, [["create", WANT, { save: true }]]);
  assert.deepEqual(r.out.slice(6, 7), ["created submission 42"]);
  assert.deepEqual(r.out.slice(-2), [
    `recorded      "submission": { "id": 42 } in papers/p/paperlint.json`,
    `next          npx paperlint submission show papers/p — it should say "match yes"`,
  ]);
  assert.ok(
    r.out.includes(
      `do on the site, ${SITE}/paper/42 — paperlint sends only the title, the abstract, the authors and the PDF:`,
    ),
  );
  const written = new TextDecoder().decode(
    fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
  );
  assert.deepEqual(JSON.parse(written), {
    extends: "../../venue.jsonc",
    authors: AUTHORS,
    submission: { id: 42 },
  });
  // And the next run reads it: `new` again is refused, `show` asks for 42.
  const again = await run({ sub: "new" }, { files: fs });
  assert.equal(again.code, 2);
  assert.deepEqual(again.errs, [
    `${PAPER}/paperlint.json: the paper already has submission 42 on ${SITE} — \`paperlint submission show\` reads it, \`paperlint submission update\` changes it`,
  ]);
  const show = await run({ sub: "show" }, { files: fs });
  assert.deepEqual(show.seen[0]?.calls, [["show", 42]]);
});

test("new --save in the cycles form: the id goes into the open attempt, the last cycle", async () => {
  const cycle = (id: string, outcome: unknown) => ({
    id,
    venue: { kind: "preset", extends: "../../venue.jsonc" },
    opened: "2026-10-01",
    ...(outcome === null ? {} : { outcome }),
  });
  const closed = cycle("first", {
    kind: "rejected",
    date: "2026-10-05",
    evidence: "mail.eml",
  });
  const fs = newFiles({
    paper: { authors: AUTHORS, cycles: [closed, cycle("second", null)] },
  });
  const r = await run({ sub: "new", save: true }, { files: fs });
  assert.equal(r.code, 0, r.errs.join("\n"));
  const written: unknown = JSON.parse(
    new TextDecoder().decode(
      fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
    ),
  );
  assert.deepEqual(written, {
    authors: AUTHORS,
    cycles: [closed, { ...cycle("second", null), submission: { id: 42 } }],
  });
});

test('🔴 new without "authors": refused with the key to fill — never guessed, nothing sent', async () => {
  const r = await run(
    { sub: "new" },
    { files: newFiles({ paper: { extends: "../../venue.jsonc" } }) },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.seen[0]?.calls, []);
  assert.deepEqual(r.errs, [
    `${PAPER}/paperlint.json: no "authors" — add "authors": [{ "name": "…", "email": "…", "affiliation": "…" }], every author in the paper's order, as 127.0.0.1 should record them; paperlint never guesses them`,
  ]);
});

test("the build's facts only stand in for the title: none, stale or broken change nothing when \\title reads", async () => {
  const runs = await Promise.all(
    [null, facts({ sha: "0".repeat(64) }), "{"].map((f) =>
      run({ sub: "new" }, { files: newFiles({ facts: f }) }),
    ),
  );
  assert.deepEqual(
    runs.map((r) => [r.code, r.seen[0]?.calls]),
    runs.map(() => [0, [["create", WANT, { save: false }]]]),
  );
});

test("🔴 an abstract in a file paper.tex includes is read there, as the build recorded it", async () => {
  const tex = DEFAULT_TEX.replace(ABSTRACT_TEX, "\\input{abstract}\n");
  const r = await run(
    { sub: "new" },
    {
      files: files({
        paper: { extends: "../../venue.jsonc", authors: AUTHORS },
        extra: builtPaper(
          PAPER,
          { "paper.tex": tex, "abstract.tex": ABSTRACT_TEX },
          [
            { path: "paper.tex", role: "body" },
            { path: "abstract.tex", role: "body" },
          ],
        ),
      }),
    },
  );
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.seen[0]?.calls, [["create", WANT, { save: false }]]);
});

test("new --abstract <file>: its text is sent instead of the build's, whitespace as one space", async () => {
  const fs = newFiles({
    facts: null,
    paper: { extends: "../../venue.jsonc", authors: AUTHORS },
  });
  const r = await run(
    { sub: "new", abstract: "abs.txt" },
    {
      files: {
        ...fs,
        readBytes: (p) =>
          p === "/w/abs.txt"
            ? new TextEncoder().encode(" Line one.\n\nLine two. \n")
            : fs.readBytes(p),
      },
    },
  );
  assert.equal(r.code, 0, r.errs.join("\n"));
  assert.deepEqual(r.seen[0]?.calls, [
    ["create", { ...WANT, abstract: "Line one. Line two." }, { save: false }],
  ]);
});

test("new: the paper already accepted in its current cycle — refused; a new submission is a new cycle", async () => {
  const r = await run(
    { sub: "new" },
    {
      files: newFiles({
        paper: {
          authors: AUTHORS,
          cycles: [
            {
              id: "one",
              venue: { kind: "preset", extends: "../../venue.jsonc" },
              opened: "2026-10-01",
              outcome: {
                kind: "accepted",
                date: "2026-10-09",
                evidence: "m.eml",
              },
            },
          ],
        },
      }),
    },
  );
  assert.equal(r.code, 2);
  assert.deepEqual(r.errs, [
    `${PAPER}/paperlint.json: the current attempt is accepted — a new submission belongs to a new cycle`,
  ]);
});

test("new: no PDF, a portal that says invalid, a save the portal did not make — each exits non-zero", async () => {
  const noPdf = await run(
    { sub: "new", pdf: "nope.pdf" },
    { files: newFiles({}) },
  );
  assert.equal(noPdf.code, 2);
  assert.deepEqual(noPdf.errs, [
    "no PDF at nope.pdf — build the paper, or name one with --pdf",
  ]);
  const invalid = await run(
    { sub: "new" },
    {
      files: newFiles({}),
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: false,
          changes: ["new"],
          messages: [
            { message: "Entry required.", field: "topics", status: 2 },
          ],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(invalid.code, 1);
  assert.deepEqual(invalid.out.slice(-2), [
    "changes       new",
    "  portal says: topics: Entry required.",
  ]);
  const withheld = await run(
    { sub: "new", save: true },
    {
      files: newFiles({}),
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: true,
          changes: ["new"],
          messages: [],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(withheld.code, 1);
  assert.ok(
    withheld.out.includes("NOTHING CREATED — the portal did not save it"),
  );
});

test("🔴 an abstract paperlint cannot read without guessing is refused, naming the construct and its line — nothing sent", async () => {
  const undefinedMacro = await run(
    { sub: "new" },
    {
      files: newFiles({
        tex: DEFAULT_TEX.replace("\\ours{} resolved", "\\nope{} resolved"),
      }),
    },
  );
  assert.equal(undefinedMacro.code, 2);
  assert.deepEqual(undefinedMacro.errs, [
    "the abstract, paper.tex:7:28: \\nope, which no \\newcommand, \\renewcommand or \\def in the paper defines — paperlint sends no text it would have to guess; give the abstract with --abstract <file>, a plain-text file",
  ]);
  const none = await run(
    { sub: "new" },
    { files: newFiles({ tex: DEFAULT_TEX.replace(ABSTRACT_TEX, "") }) },
  );
  assert.deepEqual(none.errs, [
    "paper.tex has no \\begin{abstract}…\\end{abstract} — give the abstract with --abstract <file>, a plain-text file",
  ]);
  assert.deepEqual(
    [undefinedMacro, none].map((r) => r.seen[0]?.calls),
    [[], []],
  );
});

test("titleOf: \\title as text; an author's macro in it → the PDF's Title; neither → the fix", () => {
  const src = (t: string) =>
    `\\documentclass{article}\\title{${t}}\\begin{document}\\end{document}`;
  assert.deepEqual(titleOf(src("Plain  Title"), latexReader, null), {
    ok: true,
    value: "Plain Title",
  });
  assert.deepEqual(
    titleOf(src("\\ours{}: Lies"), latexReader, { Title: "TestLie: Lies" }),
    { ok: true, value: "TestLie: Lies" },
  );
  assert.deepEqual(
    titleOf(src("\\ours{}: Lies"), latexReader, {
      "dc:title": "From The XMP",
    }),
    { ok: true, value: "From The XMP" },
  );
  assert.deepEqual(
    titleOf(null, latexReader, { Title: "Info", "dc:title": "XMP" }),
    { ok: true, value: "Info" },
  );
  assert.deepEqual(titleOf(src("\\ours{}: Lies"), latexReader, {}), {
    ok: false,
    error:
      "the \\title in paper.tex uses a command paperlint does not read («…: Lies»), and the PDF names no Title — set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild",
  });
  assert.deepEqual(titleOf(null, latexReader, null), {
    ok: false,
    error:
      "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
  });
});

test("🔴 new --save, but paperlint.json changed under it: the id is printed with the line to add by hand, exit 1", async () => {
  const config = absolutePath(`${PAPER}/paperlint.json`);
  const cases = [
    [null, "the file is gone"],
    ["{", "not JSON: "],
    ["[1]", "must be a JSON object"],
  ] as const;
  /** `new --save`, with paperlint.json replaced by `swap` (null: removed) once the portal answered. */
  const savedWith = (swap: string | null) => {
    const fs = newFiles({});
    const created = { now: false };
    const portal = fakePortal({});
    return run(
      { sub: "new", save: true },
      {
        files: {
          ...fs,
          readBytes: (p) =>
            created.now && p === config
              ? swap === null
                ? null
                : new TextEncoder().encode(swap)
              : fs.readBytes(p),
        },
        portal: {
          ...portal,
          portalFor: (site, token) => {
            const inner = portal.portalFor(site, token);
            return {
              ...inner,
              create: async (paper, o) => {
                const a = await inner.create(paper, o);
                created.now = true;
                return a;
              },
            };
          },
        },
      },
    );
  };
  const runs = await Promise.all(map(cases, ([swap]) => savedWith(swap)));
  const head =
    "submission 42 was created, but papers/p/paperlint.json was not changed (";
  const tail = `) — add "submission": { "id": 42 } to the current attempt by hand`;
  assert.deepEqual(
    map(runs, (r, i) => {
      const line = r.errs[0] ?? "";
      return [
        r.code,
        r.errs.length,
        line.startsWith(head),
        line.includes(cases[i]?.[1] ?? "?"),
        line.endsWith(tail),
      ];
    }),
    map(cases, () => [1, 1, true, true, true]),
  );
});

test("new: no paper.tex — the PDF's Title stands in; without one either, the fix is named", async () => {
  const noTex = newFiles({
    tex: null,
    facts: facts({ title: "From The PDF" }),
  });
  const titled = await run(
    { sub: "new", abstract: "abs.txt" },
    {
      files: {
        ...noTex,
        readBytes: (p) =>
          p === "/w/abs.txt"
            ? new TextEncoder().encode("Given.")
            : noTex.readBytes(p),
      },
    },
  );
  assert.equal(titled.code, 0, titled.errs.join("\n"));
  assert.equal(titled.out[1], "title         From The PDF");
  const noAbstract = await run(
    { sub: "new" },
    { files: newFiles({ tex: null, facts: facts({ title: "From The PDF" }) }) },
  );
  assert.deepEqual(noAbstract.errs, [
    "no paper.tex to read the abstract from — give the abstract with --abstract <file>, a plain-text file",
  ]);
  const untitled = await run(
    { sub: "new" },
    { files: newFiles({ tex: null }) },
  );
  assert.equal(untitled.code, 2);
  assert.deepEqual(untitled.errs, [
    "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
  ]);
});

test("new: --abstract naming no file is refused before anything is sent; run from the paper folder, the next command says `.`", async () => {
  const missing = await run(
    { sub: "new", abstract: "nope.txt" },
    { files: newFiles({}) },
  );
  assert.equal(missing.code, 2);
  assert.deepEqual(missing.errs, ["--abstract: no file at nope.txt"]);
  assert.deepEqual(missing.seen[0]?.calls, []);
  const here = await run(
    { sub: "new", paperDir: "." },
    {
      files: newFiles({}),
      cwd: PAPER,
      portal: fakePortal({
        create: ok({
          httpStatus: 200,
          valid: true,
          changes: [],
          messages: [],
          dryRun: true,
          id: null,
        }),
      }),
    },
  );
  assert.equal(here.code, 0, here.errs.join("\n"));
  assert.ok(here.out.includes("changes       —"));
  assert.ok(
    here.out.includes(
      "  - then mark it submitted: npx paperlint submission update . --submit (a dry run; --save after your yes)",
    ),
  );
});

test("a refusal at a place no file of the paper holds is named at paper.tex", async () => {
  const r = await run(
    { sub: "new" },
    {
      files: newFiles({}),
      latex: {
        ...latexReader,
        abstractText: () => ({
          ok: false,
          error: { kind: "unreadable", what: "\\x", at: 1_000_000 },
        }),
      },
    },
  );
  assert.deepEqual(r.errs, [
    "the abstract, paper.tex: \\x — paperlint sends no text it would have to guess; give the abstract with --abstract <file>, a plain-text file",
  ]);
});
