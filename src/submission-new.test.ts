/** `paperlint submission new`: what it reads and sends, the dry run, the save that records the id, the refusals. */
import { map } from "remeda";
import { expect, test } from "vitest";
import { builtPaper } from "../test/recorded-fixture.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { err, ok } from "./domain/result.ts";
import { OPAQUE } from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
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
  ON_THE_SITE,
  NO_ERRORS,
} from "../test/submission-fixtures.ts";

test("new: a dry run by default — title from \\title, abstract from \\begin{abstract} with the author's macro expanded, the declared authors, the PDF", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new" }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(r.errs).toStrictEqual([]);
  expect(r.seen[0]?.calls).toStrictEqual([["create", WANT, { save: false }]]);
  expect(r.out).toStrictEqual([
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    NO_ERRORS,
    "title         Agents That Lie",
    "author 1      Ada Lovelace <ada@example.org>, Analytical",
    "author 2      Bob Bobson <bob@example.org>",
    "abstract      17 words:",
    `  ${WANT.abstract}`,
    "dry run — the portal checked the new submission and kept nothing; --save creates it for real",
    "HTTP          200",
    "valid         yes",
    "changes       new, title, abstract, authors, submission",
    `still to do for ${SITE}/paper/<its number> — paperlint sent the title, the abstract, the authors and the PDF:`,
    ON_THE_SITE,
    "  - then mark it submitted: npx paperlint submission update papers/p --submit (a dry run; --save after your yes)",
  ]);
  // A dry run writes nothing.
  expect(
    JSON.parse(
      new TextDecoder().decode(
        fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ??
          new Uint8Array(),
      ),
    ),
  ).toStrictEqual({ extends: "../../venue.jsonc", authors: AUTHORS });
});

test("new --save: the id the portal chose is written into paperlint.json, and `show` is the next command", async () => {
  const fs = newFiles({});
  const r = await run({ sub: "new", save: true }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([["create", WANT, { save: true }]]);
  expect(r.out.slice(7, 8)).toStrictEqual(["created submission 42"]);
  expect(r.out.slice(-2)).toStrictEqual([
    `recorded      "submission": { "id": 42 } in papers/p/paperlint.json`,
    `next          npx paperlint submission show papers/p — it should say "match yes"`,
  ]);
  expect(r.out).toContain(
    `still to do for ${SITE}/paper/42 — paperlint sent the title, the abstract, the authors and the PDF:`,
  );
  const written = new TextDecoder().decode(
    fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
  );
  expect(JSON.parse(written)).toStrictEqual({
    extends: "../../venue.jsonc",
    authors: AUTHORS,
    submission: { id: 42 },
  });
  // And the next run reads it: `new` again is refused, `show` asks for 42.
  const again = await run({ sub: "new" }, { files: fs });
  expect(again.code).toBe(2);
  expect(again.errs).toStrictEqual([
    `${PAPER}/paperlint.json: the paper already has submission 42 on ${SITE} — \`paperlint submission show\` reads it, \`paperlint submission update\` changes it`,
  ]);
  const show = await run({ sub: "show" }, { files: fs });
  expect(show.seen[0]?.calls).toStrictEqual([["show", 42]]);
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
  expect(r.code, r.errs.join("\n")).toBe(0);
  const written: unknown = JSON.parse(
    new TextDecoder().decode(
      fs.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ?? new Uint8Array(),
    ),
  );
  expect(written).toStrictEqual({
    authors: AUTHORS,
    cycles: [closed, { ...cycle("second", null), submission: { id: 42 } }],
  });
});

test('new without "authors": refused with the key to fill — never guessed, nothing sent', async () => {
  const r = await run(
    { sub: "new" },
    { files: newFiles({ paper: { extends: "../../venue.jsonc" } }) },
  );
  expect(r.code).toBe(2);
  expect(r.seen[0]?.calls).toStrictEqual([]);
  expect(r.errs).toStrictEqual([
    `${PAPER}/paperlint.json: no "authors" — add "authors": [{ "name": "…", "email": "…", "affiliation": "…" }], every author in the paper's order, as 127.0.0.1:9 should record them; paperlint never guesses them`,
  ]);
});

test("the build's facts only stand in for the title: none, stale or broken change nothing when \\title reads", async () => {
  const runs = await Promise.all(
    [null, facts({ sha: "0".repeat(64) }), "{"].map((f) =>
      run({ sub: "new" }, { files: newFiles({ facts: f }) }),
    ),
  );
  expect(runs.map((r) => [r.code, r.seen[0]?.calls])).toStrictEqual(
    runs.map(() => [0, [["create", WANT, { save: false }]]]),
  );
});

test("an abstract in a file paper.tex includes is read there, as the build recorded it", async () => {
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
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([["create", WANT, { save: false }]]);
});

test("two \\title declarations and no PDF Title: refused, naming each place — nothing sent", async () => {
  const r = await run(
    { sub: "new" },
    {
      files: newFiles({
        tex: DEFAULT_TEX.replace(
          "\\title{Agents That\\\\ Lie}\n",
          "\\title{Agents That\\\\ Lie}\n\\title{Second}\n",
        ),
      }),
    },
  );
  expect([r.code, r.errs, r.seen[0]?.calls]).toStrictEqual([
    2,
    [
      "the paper sets \\title 2 times (paper.tex:3:8, paper.tex:4:8), and the PDF names no Title — which one to send is not guessed: keep one \\title, or set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild",
    ],
    [],
  ]);
});

test("a \\title in a file paper.tex includes is read there, as the build recorded it", async () => {
  const title = "\\title{Agents That\\\\ Lie}\n";
  expect(DEFAULT_TEX).toContain(title);
  const r = await run(
    { sub: "new" },
    {
      files: files({
        paper: { extends: "../../venue.jsonc", authors: AUTHORS },
        extra: builtPaper(
          PAPER,
          {
            "paper.tex": DEFAULT_TEX.replace(title, "\\input{front}\n"),
            "front.tex": title,
          },
          [
            { path: "paper.tex", role: "body" },
            { path: "front.tex", role: "body" },
          ],
        ),
      }),
    },
  );
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([["create", WANT, { save: false }]]);
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
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
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
  expect(r.code).toBe(2);
  expect(r.errs).toStrictEqual([
    `${PAPER}/paperlint.json: the current attempt is accepted — a new submission belongs to a new cycle`,
  ]);
});

test("new: no PDF, a portal that says invalid, a save the portal did not make — each exits non-zero", async () => {
  const noPdf = await run(
    { sub: "new", pdf: "nope.pdf" },
    { files: newFiles({}) },
  );
  expect(noPdf.code).toBe(2);
  expect(noPdf.errs).toStrictEqual([
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
  expect(invalid.code).toBe(1);
  expect(invalid.out.slice(-2)).toStrictEqual([
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
  expect(withheld.code).toBe(1);
  expect(withheld.out).toContain(
    "NOTHING CREATED — the portal did not save it",
  );
});

test("an abstract paperlint cannot read without guessing is refused, naming the construct and its line — nothing sent", async () => {
  const undefinedMacro = await run(
    { sub: "new" },
    {
      files: newFiles({
        tex: DEFAULT_TEX.replace("\\ours{} resolved", "\\nope{} resolved"),
      }),
    },
  );
  expect(undefinedMacro.code).toBe(2);
  expect(undefinedMacro.errs).toStrictEqual([
    "the abstract, paper.tex:7:28: \\nope, which no \\newcommand, \\renewcommand or \\def in the paper defines — paperlint sends no text it would have to guess; give the abstract with --abstract <file>, a plain-text file",
  ]);
  const twice = await run(
    { sub: "new" },
    {
      files: newFiles({
        tex: DEFAULT_TEX.replace(
          "\\newcommand{\\ours}{TestLie}\n",
          "\\newcommand{\\ours}{TestLie}\n\\providecommand{\\ours}{Other}\n",
        ),
      }),
    },
  );
  expect([twice.code, twice.errs]).toStrictEqual([
    2,
    [
      "the abstract uses \\ours, which the paper defines 2 times (paper.tex:2:1, paper.tex:3:1) — which one TeX uses there is not guessed; give the abstract with --abstract <file>, a plain-text file",
    ],
  ]);
  const none = await run(
    { sub: "new" },
    { files: newFiles({ tex: DEFAULT_TEX.replace(ABSTRACT_TEX, "") }) },
  );
  expect(none.errs).toStrictEqual([
    "paper.tex has no \\begin{abstract}…\\end{abstract} — give the abstract with --abstract <file>, a plain-text file",
  ]);
  expect([undefinedMacro, none].map((r) => r.seen[0]?.calls)).toStrictEqual([
    [],
    [],
  ]);
});

test("titleOf: the source's one \\title as text; one the reader cannot read whole, or several → the PDF's Info Title, then its XMP dc:title; neither → the fix", () => {
  /** A LaTeX reader whose source has a `\\title` with each text in `texts` (at offsets 0, 40, …); `"none"` has none. */
  const titled = (...texts: string[]): Pick<LatexReader, "headings"> => ({
    headings: (src) =>
      src === "none"
        ? []
        : texts.map((text, i) => ({
            command: { kind: "title" },
            argument: "title",
            title: { segments: [{ text, at: 40 * i }] },
          })),
  });
  const plain = titled("Plain \u2028 Title");
  const opaque = titled(`${OPAQUE}: Lies`);
  const twice = titled("One", "Two");
  const where = (o: number) => `@${String(o)}`;
  expect([
    titleOf({ text: "src", where }, plain, { Title: "Ignored" }),
    titleOf({ text: "src", where }, opaque, {
      Title: "Info",
      "dc:title": "XMP",
    }),
    titleOf({ text: "src", where }, opaque, { "dc:title": "From The XMP" }),
    titleOf(null, plain, { Title: "Info" }),
    titleOf({ text: "src", where }, opaque, {}),
    titleOf({ text: "none", where }, plain, null),
    titleOf({ text: "src", where }, twice, { Title: "Info" }),
    titleOf({ text: "src", where }, twice, null),
  ]).toStrictEqual([
    ok("Plain Title"),
    ok("Info"),
    ok("From The XMP"),
    ok("Info"),
    err(
      "the \\title in paper.tex uses a command paperlint does not read («…: Lies»), and the PDF names no Title — set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild",
    ),
    err(
      "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
    ),
    ok("Info"),
    err(
      "the paper sets \\title 2 times (@0, @40), and the PDF names no Title — which one to send is not guessed: keep one \\title, or set \\hypersetup{pdftitle={<the title as plain text>}} and rebuild",
    ),
  ]);
});

test("new --save, but paperlint.json changed under it: the id is printed with the line to add by hand, exit 1", async () => {
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
  const head = `submission 42 was created (${SITE}/paper/42), but papers/p/paperlint.json was not changed (`;
  const tail = `) — add "submission": { "id": 42 } to the current attempt by hand`;
  expect(
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
  ).toStrictEqual(map(cases, () => [1, 1, true, true, true]));
});

test("new --save, but paperlint.json cannot be written: the id, its page and the line to add are printed, exit 1", async () => {
  const fs = newFiles({});
  const r = await run(
    { sub: "new", save: true },
    {
      files: {
        ...fs,
        writeAtomic: () => {
          throw new Error("EROFS: read-only file system");
        },
      },
    },
  );
  expect([r.code, r.errs]).toStrictEqual([
    1,
    [
      `submission 42 was created (${SITE}/paper/42), but papers/p/paperlint.json was not changed (EROFS: read-only file system) — add "submission": { "id": 42 } to the current attempt by hand`,
    ],
  ]);
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
  expect(titled.code, titled.errs.join("\n")).toBe(0);
  expect(titled.out[2]).toBe("title         From The PDF");
  const noAbstract = await run(
    { sub: "new" },
    { files: newFiles({ tex: null, facts: facts({ title: "From The PDF" }) }) },
  );
  expect(noAbstract.errs).toStrictEqual([
    "no paper.tex to read the abstract from — give the abstract with --abstract <file>, a plain-text file",
  ]);
  const untitled = await run(
    { sub: "new" },
    { files: newFiles({ tex: null }) },
  );
  expect(untitled.code).toBe(2);
  expect(untitled.errs).toStrictEqual([
    "no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild",
  ]);
});

test("new: --abstract naming no file is refused before anything is sent; run from the paper folder, the next command says `.`", async () => {
  const missing = await run(
    { sub: "new", abstract: "nope.txt" },
    { files: newFiles({}) },
  );
  expect(missing.code).toBe(2);
  expect(missing.errs).toStrictEqual(["--abstract: no file at nope.txt"]);
  expect(missing.seen[0]?.calls).toStrictEqual([]);
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
  expect(here.code, here.errs.join("\n")).toBe(0);
  expect(here.out).toContain("changes       —");
  expect(here.out).toContain(
    "  - then mark it submitted: npx paperlint submission update . --submit (a dry run; --save after your yes)",
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
  expect(r.errs).toStrictEqual([
    "the abstract, paper.tex: \\x — paperlint sends no text it would have to guess; give the abstract with --abstract <file>, a plain-text file",
  ]);
});

test("new prints the venue rules' findings on the PDF it creates the submission with; --save refuses facts that do not describe it, and creates nothing", async () => {
  const dry = await run({ sub: "new" }, { files: newFiles({}) });
  expect(dry.out[1]).toBe(NO_ERRORS);
  const stale = newFiles({ facts: facts({ sha: "b".repeat(64) }) });
  const saved = await run({ sub: "new", save: true }, { files: stale });
  expect([saved.code, saved.seen[0]?.calls]).toStrictEqual([2, []]);
  expect(saved.errs).toStrictEqual([
    "refused: no build facts describe this PDF (none, unreadable, or of other bytes), so the venue rules did not see it — rebuild (`paperlint build`), run the dry run again, and read its venue check; nothing was sent",
  ]);
  // Where lint reports it: the paper.tex line of \documentclass.
  expect(saved.out.slice(1, 3)).toStrictEqual([
    `${PAPER}/paper.tex`,
    "  1:2  error  _build/paper.facts.json describes a paper.pdf with another SHA-256 than the PDF being sent, so the venue checks would judge other bytes — rebuild the paper (`paperlint build`) from the source of the PDF you send  pdf/fresh",
  ]);
  expect(
    JSON.parse(
      new TextDecoder().decode(
        stale.readBytes(absolutePath(`${PAPER}/paperlint.json`)) ??
          new Uint8Array(),
      ),
    ),
  ).toStrictEqual({ extends: "../../venue.jsonc", authors: AUTHORS });
});
